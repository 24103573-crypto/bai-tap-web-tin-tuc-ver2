
// =============================================
// CRAWLER.JS - TRÍCH XUẤT BÀI VIẾT DÂN TRÍ
// Chỉ sử dụng JavaScript thuần.
// =============================================

const STORAGE_POSTS = "news_posts";

const form = document.getElementById("crawlerForm");
const urlInput = document.getElementById("articleURL");
const statusBox = document.getElementById("crawlerStatus");
const crawlButton = document.getElementById("crawlButton");
const previewSection = document.getElementById("previewSection");
const previewBox = document.getElementById("crawlerPreview");
const saveButton = document.getElementById("saveButton");
const resetButton = document.getElementById("resetButton");

let extractedPost = null;

// =============================================
// 1. CÁC HÀM TIỆN ÍCH
// =============================================

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function normalizeText(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

// Chỉ chấp nhận URL thuộc chính xác tên miền Dân Trí
// hoặc tên miền phụ của dantri.com.vn.
function validateDanTriURL(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("URL không hợp lệ. Hãy nhập đường dẫn đầy đủ.");
  }

  if (url.protocol !== "https:") {
    throw new Error("Vui lòng sử dụng URL bắt đầu bằng https://.");
  }

  const host = url.hostname.toLowerCase();

  if (host !== "dantri.com.vn" && !host.endsWith(".dantri.com.vn")) {
    throw new Error("Chỉ hỗ trợ URL thuộc tên miền dantri.com.vn.");
  }

  // Không chấp nhận thông tin đăng nhập trong URL.
  if (url.username || url.password) {
    throw new Error("URL không được chứa thông tin đăng nhập.");
  }

  // Loại bỏ fragment và tham số theo dõi phổ biến.
  url.hash = "";
  ["utm_source", "utm_medium", "utm_campaign", "fbclid"]
    .forEach((key) => url.searchParams.delete(key));

  return url.href;
}

// Lấy nội dung từ meta tag theo nhiều tên có thể gặp.
function getMeta(doc, names) {
  for (const name of names) {
    const selectors = [
      `meta[property="${name}"]`,
      `meta[name="${name}"]`,
      `meta[itemprop="${name}"]`
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      const value = element?.getAttribute("content");

      if (value && value.trim()) {
        return normalizeText(value);
      }
    }
  }

  return "";
}

// Chuyển đường dẫn tương đối thành URL đầy đủ.
function absoluteURL(value, baseURL) {
  if (!value) return "";

  try {
    const result = new URL(value, baseURL);

    if (result.protocol !== "http:" && result.protocol !== "https:") {
      return "";
    }

    return result.href;
  } catch {
    return "";
  }
}

// Tạo ID tương đối ổn định từ URL.
function createPostId(url) {
  const cleanURL = url.split("?")[0];
  const match = cleanURL.match(/(\d{10,})/);

  if (match) {
    return "dtri-" + match[1];
  }

  // Tạo ID từ URL nếu không có mã số trong đường dẫn.
  let hash = 0;

  for (let i = 0; i < cleanURL.length; i++) {
    hash = (hash * 31 + cleanURL.charCodeAt(i)) | 0;
  }

  return "dtri-" + Math.abs(hash).toString(36);
}

// Chuẩn hóa thời gian về YYYY-MM-DD HH:mm khi có thể.
function normalizePublishedAt(value) {
  if (!value) return new Date().toISOString().slice(0, 16).replace("T", " ");

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    // Nếu không phân tích được, giữ giá trị gốc để kiểm tra.
    return value;
  }

  const pad = (number) => String(number).padStart(2, "0");

  return (
    date.getFullYear() + "-" +
    pad(date.getMonth() + 1) + "-" +
    pad(date.getDate()) + " " +
    pad(date.getHours()) + ":" +
    pad(date.getMinutes())
  );
}

// =============================================
// 2. GỌI API TRUNG GIAN ĐỂ LẤY HTML
// =============================================

async function fetchArticleHTML(articleURL) {
  // URL được mã hóa để truyền an toàn thành tham số.
  const apiURL =
    "https://api.allorigins.win/raw?url=" +
    encodeURIComponent(articleURL);

  const response = await fetch(apiURL, {
    method: "GET",
    headers: {
      "Accept": "text/html"
    }
  });

  if (!response.ok) {
    throw new Error(
      "API trung gian trả về HTTP " + response.status +
      ". Hãy thử lại sau hoặc dùng URL khác."
    );
  }

  const html = await response.text();

  if (!html || html.length < 500) {
    throw new Error("HTML trả về quá ngắn hoặc không phải nội dung bài báo.");
  }

  // Phòng trường hợp API trả về trang lỗi thay vì bài báo.
  if (
    /access denied|captcha|too many requests|cloudflare/i.test(html.slice(0, 3000))
  ) {
    throw new Error(
      "Trang nguồn có thể đang chặn yêu cầu tự động hoặc yêu cầu xác minh."
    );
  }

  return html;
}

// =============================================
// 3. TRÍCH XUẤT NỘI DUNG HTML
// =============================================

function extractArticle(html, articleURL) {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // Tiêu đề: ưu tiên Open Graph, sau đó đến thẻ title.
  const title =
    getMeta(doc, ["og:title", "twitter:title"]) ||
    normalizeText(doc.querySelector("h1")?.textContent) ||
    normalizeText(doc.title);

  if (!title) {
    throw new Error("Không tìm thấy tiêu đề bài viết.");
  }

  // Mô tả ngắn.
  const excerpt =
    getMeta(doc, [
      "og:description",
      "description",
      "twitter:description"
    ]) ||
    normalizeText(doc.querySelector("h1")?.parentElement?.textContent)
      .slice(0, 300);

  // Ảnh đại diện.
  const thumbnail = absoluteURL(
    getMeta(doc, ["og:image", "twitter:image"]) ||
    doc.querySelector("article img, .singular-content img, figure img")?.getAttribute("src") ||
    "",
    articleURL
  );

  // Thời gian đăng.
  const publishedAt = normalizePublishedAt(
    getMeta(doc, [
      "article:published_time",
      "datePublished",
      "pubdate",
      "publish_date"
    ]) ||
    doc.querySelector("time[datetime]")?.getAttribute("datetime") ||
    doc.querySelector("time")?.textContent ||
    ""
  );

  // Tác giả: đọc meta trước, sau đó tìm các phần tử thường gặp.
  const author =
    getMeta(doc, ["author", "article:author"]) ||
    normalizeText(
      doc.querySelector('[rel="author"], .author-name, .singular-author')
        ?.textContent
    ) ||
    "Chưa xác định";

  // Chuyên mục: ưu tiên breadcrumb, sau đó suy luận từ URL.
  const breadcrumbs = [
    ...doc.querySelectorAll(
      'nav[aria-label*="breadcrumb" i] a, .breadcrumb a, [class*="breadcrumb"] a'
    )
  ].map((element) => normalizeText(element.textContent)).filter(Boolean);

  const categoryFromMeta = getMeta(doc, [
    "article:section",
    "section"
  ]);

  const category = detectCategory(
    categoryFromMeta || breadcrumbs.slice(-2, -1)[0] || "",
    articleURL
  );

  // Tìm phần nội dung bài báo.
  const contentRoot = doc.querySelector(
    "article .singular-content, " +
    "article .article-content, " +
    ".singular-content, " +
    ".article-content, " +
    "article"
  );

  if (!contentRoot) {
    throw new Error(
      "Không tìm thấy vùng nội dung. Trang có thể đã thay đổi cấu trúc HTML."
    );
  }

  // Loại bỏ thành phần không thuộc nội dung bài báo.
  contentRoot.querySelectorAll(
    "script, style, noscript, iframe, button, form, " +
    "nav, .related-news, .social-share, .advertisement, " +
    "[class*='comment'], [class*='recommend']"
  ).forEach((element) => element.remove());

  // Chỉ lấy văn bản của các đoạn, tránh lưu toàn bộ menu hoặc footer.
  let paragraphs = [
    ...contentRoot.querySelectorAll("p")
  ]
    .map((p) => normalizeText(p.textContent))
    .filter((text) => text.length > 30);

  // Một số trang có thể không dùng thẻ p như mong đợi.
  if (paragraphs.length === 0) {
    const text = normalizeText(contentRoot.textContent);

    if (text.length > 100) {
      paragraphs = [text];
    }
  }

  const content = paragraphs.join("\n\n");

  if (content.length < 80) {
    throw new Error(
      "Nội dung bài viết quá ngắn. Không lưu để tránh tạo dữ liệu sai."
    );
  }

  return {
    id: createPostId(articleURL),
    title,
    slug: makeSlug(title),
    excerpt: excerpt || content.slice(0, 220) + "...",
    content,
    thumbnail,
    author,
    category,
    publishedAt,
    source: "dantri.com.vn",
    url: articleURL
  };
}

// =============================================
// 4. XÁC ĐỊNH CHUYÊN MỤC
// =============================================

function detectCategory(rawCategory, articleURL) {
  const categories = [
    "Thế giới",
    "Thời sự",
    "Bất động sản",
    "Kinh doanh",
    "Xã hội",
    "Pháp luật",
    "Giáo dục",
    "Sức khỏe",
    "Thể thao",
    "Văn hóa",
    "Công nghệ",
    "Đời sống",
    "Du lịch",
    "Tấm lòng nhân ái"
  ];

  const normalized = normalizeText(rawCategory).toLowerCase();

  const matched = categories.find(
    (category) => category.toLowerCase() === normalized
  );

  if (matched) return matched;

  // Dự phòng khi breadcrumb không cung cấp tên chuyên mục.
  let path = "";

  try {
    path = new URL(articleURL).pathname.toLowerCase();
  } catch {
    return "Mới nhất";
  }

  const pathRules = [
    ["/the-gioi", "Thế giới"],
    ["/thoi-su", "Thời sự"],
    ["/bat-dong-san", "Bất động sản"],
    ["/kinh-doanh", "Kinh doanh"],
    ["/xa-hoi", "Xã hội"],
    ["/phap-luat", "Pháp luật"],
    ["/giao-duc", "Giáo dục"],
    ["/suc-khoe", "Sức khỏe"],
    ["/the-thao", "Thể thao"],
    ["/van-hoa", "Văn hóa"],
    ["/cong-nghe", "Công nghệ"],
    ["/doi-song", "Đời sống"],
    ["/du-lich", "Du lịch"],
    ["/tam-long-nhan-ai", "Tấm lòng nhân ái"]
  ];

  return pathRules.find(([prefix]) => path.includes(prefix))?.[1] || "Mới nhất";
}

// Chuyển tiêu đề thành slug không dấu.
function makeSlug(title) {
  return String(title)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// =============================================
// 5. HIỂN THỊ BẢN XEM TRƯỚC
// =============================================

function showPreview(post) {
  const image = post.thumbnail
    ? `<img class="detail-image" src="${escapeHTML(post.thumbnail)}"
            alt="${escapeHTML(post.title)}">`
    : "<p>Không tìm thấy ảnh đại diện.</p>";

  previewBox.innerHTML = `
    <span class="category-label">${escapeHTML(post.category)}</span>
    <h2>${escapeHTML(post.title)}</h2>
    <p class="meta">
      ${escapeHTML(post.author)} · ${escapeHTML(post.publishedAt)}
    </p>
    <p class="excerpt">${escapeHTML(post.excerpt)}</p>
    ${image}
    <h3>Nội dung trích xuất</h3>
    <div class="article-content">
      ${post.content
        .split(/\n\s*\n/)
        .map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`)
        .join("")}
    </div>
    <p class="meta">
      URL nguồn:
      <a href="${escapeHTML(post.url)}" target="_blank"
         rel="noopener noreferrer">Mở bài báo gốc</a>
    </p>
  `;

  previewSection.hidden = false;
}

// =============================================
// 6. XỬ LÝ FORM CRAWLER
// =============================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  extractedPost = null;
  saveButton.disabled = true;
  crawlButton.disabled = true;
  previewSection.hidden = true;

  try {
    const articleURL = validateDanTriURL(urlInput.value);

    statusBox.textContent = "Đang tải HTML và phân tích bài viết...";

    const html = await fetchArticleHTML(articleURL);

    extractedPost = extractArticle(html, articleURL);

    showPreview(extractedPost);

    saveButton.disabled = false;
    statusBox.textContent =
      "Đã trích xuất dữ liệu. Hãy kiểm tra nội dung trước khi lưu.";
  } catch (error) {
    console.error(error);

    statusBox.textContent =
      "Không thể lấy bài viết: " + error.message +
      " API CORS có thể đang gặp sự cố hoặc Dân Trí đã thay đổi cấu trúc trang.";
  } finally {
    crawlButton.disabled = false;
  }
});

// =============================================
// 7. LƯU BÀI VIẾT VÀO LOCALSTORAGE
// =============================================

saveButton.addEventListener("click", () => {
  if (!extractedPost) {
    statusBox.textContent = "Chưa có dữ liệu hợp lệ để lưu.";
    return;
  }

  try {
    const posts = JSON.parse(localStorage.getItem(STORAGE_POSTS) || "[]");

    if (!Array.isArray(posts)) {
      throw new Error("Dữ liệu bài viết trong LocalStorage không hợp lệ.");
    }

    // Kiểm tra URL trước để tránh thêm lại cùng một bài.
    const duplicate = posts.some((post) => {
      return post.url === extractedPost.url || post.id === extractedPost.id;
    });

    if (duplicate) {
      statusBox.textContent =
        "Bài viết đã tồn tại trong LocalStorage. Không thêm bản trùng.";
      return;
    }

    // Thêm bài viết mới vào đầu mảng.
    posts.unshift(extractedPost);

    localStorage.setItem(STORAGE_POSTS, JSON.stringify(posts));

    statusBox.textContent =
      "Đã lưu bài viết thành công! Bạn có thể mở trang chủ để xem.";

    saveButton.disabled = true;
  } catch (error) {
    console.error(error);
    statusBox.textContent =
      "Không lưu được dữ liệu: " + error.message;
  }
});

// =============================================
// 8. XÓA BẢN XEM TRƯỚC
// =============================================

resetButton.addEventListener("click", () => {
  extractedPost = null;
  previewSection.hidden = true;
  previewBox.replaceChildren();
  saveButton.disabled = true;
  statusBox.textContent = "";
});
