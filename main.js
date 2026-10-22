
// =============================================
// MAIN.JS - XỬ LÝ TRANG CHỦ TIN TỨC
// Sử dụng JavaScript thuần, không dùng framework.
// =============================================

const STORAGE_MENU = "news_menu";
const STORAGE_POSTS = "news_posts";

// Lưu chuyên mục đang được chọn và bài đang xem.
let currentCategory = null;
let currentPostId = null;
let allMenu = [];
let allPosts = [];

// Lấy nhanh một phần tử HTML theo ID.
const $ = (id) => document.getElementById(id);

// Chuyển dữ liệu thành chuỗi HTML an toàn.
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

// Chỉ cho phép đường dẫn ảnh HTTP/HTTPS hoặc đường dẫn tương đối.
// Không cho phép javascript: hoặc data: từ dữ liệu bên ngoài.
function safeImageURL(value) {
  const url = String(value || "").trim();

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  if (url.startsWith("/") || url.startsWith("./") || url.startsWith("../")) {
    return url;
  }

  return "";
}

// Chỉ cho phép liên kết HTTP/HTTPS.
function safeLinkURL(value) {
  const url = String(value || "").trim();

  if (/^https?:\/\//i.test(url)) {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch {
      return "";
    }
  }

  return "";
}

// Chuyển đường dẫn ảnh không hợp lệ thành ảnh trống có thông báo.
function imageHTML(url, title, className = "") {
  const safeURL = safeImageURL(url);
  const alt = escapeHTML(title);

  if (!safeURL) {
    return `<div class="empty-state">Chưa có ảnh minh họa</div>`;
  }

  return `
    <img
      class="${escapeHTML(className)}"
      src="${escapeHTML(safeURL)}"
      alt="${alt}"
      loading="lazy"
      onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'empty-state',textContent:'Không tải được ảnh'}))"
    >
  `;
}

// =============================================
// 1. NẠP DỮ LIỆU TỪ data.json VÀO LOCALSTORAGE
// =============================================

async function initializeData() {
  try {
    let storedMenu = localStorage.getItem(STORAGE_MENU);
    let storedPosts = localStorage.getItem(STORAGE_POSTS);

    // Chỉ nạp file JSON khi một trong hai phần dữ liệu chưa có.
    if (storedMenu === null || storedPosts === null) {
      $("statusMessage").textContent = "Đang nạp dữ liệu từ data.json...";

      const response = await fetch("./data.json", { cache: "no-store" });

      if (!response.ok) {
        throw new Error(
          "Không tải được data.json. Hãy kiểm tra file và địa chỉ website."
        );
      }

      const data = await response.json();

      if (!Array.isArray(data.menu) || !Array.isArray(data.posts)) {
        throw new Error("data.json phải có hai mảng menu và posts.");
      }

      // Không ghi đè phần dữ liệu đã tồn tại.
      if (storedMenu === null) {
        localStorage.setItem(STORAGE_MENU, JSON.stringify(data.menu));
      }

      if (storedPosts === null) {
        localStorage.setItem(STORAGE_POSTS, JSON.stringify(data.posts));
      }
    }

    // Mọi lần hiển thị sau đó đều đọc từ LocalStorage.
    allMenu = JSON.parse(localStorage.getItem(STORAGE_MENU) || "[]");
    allPosts = JSON.parse(localStorage.getItem(STORAGE_POSTS) || "[]");

    if (!Array.isArray(allMenu) || !Array.isArray(allPosts)) {
      throw new Error("Dữ liệu LocalStorage không đúng định dạng.");
    }

    $("statusMessage").textContent = "";
    renderMenu();
    renderFooterCategories();
    renderListing();

    // Hỗ trợ mở bài qua URL dạng index.html?id=dtri-sample-...
    const requestedId = new URLSearchParams(location.search).get("id");

    if (requestedId) {
      openPost(requestedId, false);
    }
  } catch (error) {
    console.error(error);
    $("statusMessage").textContent =
      "Không thể tải dữ liệu: " + error.message +
      " Hãy mở website qua GitHub Pages hoặc máy chủ web, không mở trực tiếp file HTML.";
  }
}

// =============================================
// 2. TẠO MENU ĐA CẤP
// =============================================

// Tạo một mục menu và các mục con bằng đệ quy.

function createMenuItem(category) {
  const li = document.createElement("li");
  li.className = "nav-item";

  const link = document.createElement("a");
  link.className = "nav-link";
  link.textContent = category.title || "Chuyên mục";

  // Xử lý các liên kết dẫn ra website bên ngoài.
  if (category.type === "external") {
    link.href = category.url;
    li.appendChild(link);
    return li;
  }

  // Các mục menu nội bộ của website.
  link.href = "#";

  link.addEventListener("click", (event) => {
    event.preventDefault();

    // Trên điện thoại, lần bấm đầu mở menu con.
    if (
      category.children?.length &&
      window.matchMedia("(max-width: 600px)").matches &&
      !li.classList.contains("open")
    ) {
      li.classList.add("open");
      return;
    }

    currentCategory =
      category.type === "home" ? null : category.title;

    currentPostId = null;

    showListingView();

    document.querySelectorAll(".nav-link").forEach((item) => {
      item.classList.remove("active");
    });

    link.classList.add("active");

    $("pageHeading").textContent =
      currentCategory || "Tin tức mới nhất";

    renderListing();

    // Đóng menu điện thoại sau khi chọn chuyên mục.
    if (window.matchMedia("(max-width: 600px)").matches) {
      $("navbar").classList.remove("mobile-open");
      $("menuToggle").setAttribute("aria-expanded", "false");
    }
  });

  li.appendChild(link);

  // Tạo menu con nếu có.
  if (Array.isArray(category.children) && category.children.length) {
    const submenu = document.createElement("ul");
    submenu.className = "dropdown";

    category.children.forEach((child) => {
      submenu.appendChild(createMenuItem(child));
    });

    li.appendChild(submenu);
  }

  return li;
}

function renderMenu() {
  const navMenu = $("navMenu");
  navMenu.replaceChildren();

  allMenu.forEach((category) => {
    navMenu.appendChild(createMenuItem(category));
  });
}

// =============================================
// 3. TẠO DANH MỤC Ở FOOTER
// =============================================

function getFlatMenu(categories) {
  const result = [];

  categories.forEach((category) => {
    result.push(category);

    if (Array.isArray(category.children)) {
      result.push(...getFlatMenu(category.children));
    }
  });

  return result;
}

function renderFooterCategories() {
  const container = $("footerCategories");
  container.replaceChildren();

  getFlatMenu(allMenu)
    .filter((category) => category.type !== "home")
    .slice(0, 8)
    .forEach((category) => {
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = category.title;

      link.addEventListener("click", (event) => {
        event.preventDefault();
        currentCategory = category.title;
        showListingView();
        $("pageHeading").textContent = category.title;
        renderListing();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });

      container.appendChild(link);
    });
}

// =============================================
// 4. SẮP XẾP VÀ LỌC BÀI VIẾT
// =============================================

function getSortedPosts() {
  // Đọc dữ liệu trực tiếp từ LocalStorage.
  const posts = JSON.parse(localStorage.getItem(STORAGE_POSTS) || "[]");

  if (!Array.isArray(posts)) return [];

  return posts
    .filter((post) => {
      return !currentCategory || post.category === currentCategory;
    })
    .sort((a, b) => {
      const dateA = new Date(a.publishedAt.replace(" ", "T")).getTime() || 0;
      const dateB = new Date(b.publishedAt.replace(" ", "T")).getTime() || 0;
      return dateB - dateA;
    });
}

function formatDate(value) {
  if (!value) return "Chưa có ngày đăng";

  const date = new Date(String(value).replace(" ", "T"));

  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

// =============================================
// 5. TẠO THẺ BÀI VIẾT
// =============================================

function postCard(post, type = "row") {
  const title = escapeHTML(post.title || "Chưa có tiêu đề");
  const excerpt = escapeHTML(post.excerpt || "");
  const category = escapeHTML(post.category || "Tin tức");
  const author = escapeHTML(post.author || "Ban biên tập");
  const date = escapeHTML(formatDate(post.publishedAt));
  const id = escapeHTML(post.id || "");

  if (type === "featured") {
    return `
      <article class="featured-card">
        <a class="card-link" href="index.html?id=${encodeURIComponent(post.id)}"
           data-post-id="${id}">
          ${imageHTML(post.thumbnail, post.title, "featured-main-image")}
          <div class="card-body">
            <span class="category-label">${category}</span>
            <h2>${title}</h2>
            <p class="excerpt">${excerpt}</p>
            <p class="meta">${author} · ${date}</p>
          </div>
        </a>
      </article>
    `;
  }

  if (type === "small") {
    return `
      <article class="featured-card featured-small">
        <a class="card-link" href="index.html?id=${encodeURIComponent(post.id)}"
           data-post-id="${id}">
          ${imageHTML(post.thumbnail, post.title)}
        </a>
        <div class="card-body">
          <span class="category-label">${category}</span>
          <a class="card-link" href="index.html?id=${encodeURIComponent(post.id)}"
             data-post-id="${id}">
            <h3>${title}</h3>
          </a>
          <p class="meta">${date}</p>
        </div>
      </article>
    `;
  }

  return `
    <article class="post-row">
      <a class="card-link" href="index.html?id=${encodeURIComponent(post.id)}"
         data-post-id="${id}">
        ${imageHTML(post.thumbnail, post.title)}
      </a>
      <div class="card-body">
        <span class="category-label">${category}</span>
        <a class="card-link" href="index.html?id=${encodeURIComponent(post.id)}"
           data-post-id="${id}">
          <h3>${title}</h3>
        </a>
        <p class="excerpt">${excerpt}</p>
        <p class="meta">${author} · ${date}</p>
      </div>
    </article>
  `;
}

// =============================================
// 6. HIỂN THỊ DANH SÁCH VÀ TIN NỔI BẬT
// =============================================

function renderListing() {
  const posts = getSortedPosts();

  $("postCount").textContent = posts.length + " bài viết";

  const featuredMain = $("featuredMain");
  const featuredSide = $("featuredSide");
  const postList = $("postList");

  featuredMain.replaceChildren();
  featuredSide.replaceChildren();
  postList.replaceChildren();

  if (posts.length === 0) {
    $("featuredSection").hidden = true;
    postList.innerHTML =
      '<div class="empty-state">Chưa có bài viết trong chuyên mục này.</div>';
    return;
  }

  $("featuredSection").hidden = false;

  featuredMain.innerHTML = postCard(posts[0], "featured");

  // Hai bài tiếp theo nằm ở cột bên phải.
  posts.slice(1, 3).forEach((post) => {
    featuredSide.insertAdjacentHTML("beforeend", postCard(post, "small"));
  });

  // Từ bài thứ tư trở đi, hiển thị theo danh sách dọc.
  posts.slice(3).forEach((post) => {
    postList.insertAdjacentHTML("beforeend", postCard(post, "row"));
  });

  // Nếu chỉ có một bài, không để trống cột bên phải.
  if (posts.length <= 1) {
    featuredSide.innerHTML = "";
  }

  if (posts.length <= 3) {
    $("postList").innerHTML =
      '<div class="empty-state">Bạn đã xem hết các bài viết trong mục này.</div>';
  }
}

// =============================================
// 7. MỞ CHI TIẾT BÀI VIẾT
// =============================================

function openPost(postId, updateURL = true) {
  const posts = JSON.parse(localStorage.getItem(STORAGE_POSTS) || "[]");
  const post = posts.find((item) => item.id === postId);

  if (!post) {
    $("statusMessage").textContent = "Không tìm thấy bài viết này.";
    return;
  }

  currentPostId = postId;

  $("listingView").hidden = true;
  $("detailView").hidden = false;
  $("articleDetail").innerHTML = "";

  // Chuyển nội dung nhiều đoạn thành các thẻ <p>.
  // escapeHTML ngăn nội dung bài viết chèn mã HTML nguy hiểm.
  const paragraphs = String(post.content || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHTML(paragraph)}</p>`)
    .join("");

  const articleURL = safeLinkURL(post.url);

  $("articleDetail").innerHTML = `
    <div class="detail-content">
      <span class="category-label">${escapeHTML(post.category || "Tin tức")}</span>
      <h1>${escapeHTML(post.title || "Chưa có tiêu đề")}</h1>
      <p class="meta">
        Đăng lúc ${escapeHTML(formatDate(post.publishedAt))}
        · Tác giả: ${escapeHTML(post.author || "Ban biên tập")}
      </p>
      <p class="detail-excerpt">${escapeHTML(post.excerpt || "")}</p>
      ${imageHTML(post.thumbnail, post.title, "detail-image")}
      <div class="article-content">${paragraphs || "<p>Chưa có nội dung bài viết.</p>"}</div>
      ${
        articleURL
          ? `<p class="meta">Nguồn tham khảo:
               <a href="${escapeHTML(articleURL)}" target="_blank"
                  rel="noopener noreferrer">Xem bài gốc</a>
             </p>`
          : ""
      }
    </div>
  `;

  $("statusMessage").textContent = "";

  if (updateURL) {
    const url = new URL(window.location.href);
    url.searchParams.set("id", postId);
    history.pushState({ postId }, "", url);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showListingView() {
  $("detailView").hidden = true;
  $("listingView").hidden = false;

  const url = new URL(window.location.href);
  url.searchParams.delete("id");
  history.replaceState({}, "", url);
}

// =============================================
// 8. SỰ KIỆN NÚT BẤM VÀ NÚT QUAY LẠI
// =============================================

$("backButton").addEventListener("click", () => {
  currentPostId = null;
  showListingView();
  renderListing();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Dùng sự kiện chung để xử lý các liên kết bài viết được tạo động.
document.addEventListener("click", (event) => {
  const link = event.target.closest("[data-post-id]");

  if (!link) return;

  event.preventDefault();
  openPost(link.dataset.postId);
});

// Xử lý nút quay lại của trình duyệt.
window.addEventListener("popstate", () => {
  const id = new URLSearchParams(location.search).get("id");

  if (id) {
    openPost(id, false);
  } else {
    showListingView();
    renderListing();
  }
});

// Nút bật/tắt menu trên màn hình nhỏ.
$("menuToggle").addEventListener("click", () => {
  const navbar = $("navbar");
  const isOpen = navbar.classList.toggle("mobile-open");

  $("menuToggle").setAttribute("aria-expanded", String(isOpen));
});

// Nhấp logo để quay về trang chủ.
$("homeLogo").addEventListener("click", (event) => {
  event.preventDefault();
  currentCategory = null;
  currentPostId = null;
  showListingView();
  $("pageHeading").textContent = "Tin tức mới nhất";
  renderListing();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

// Tự động cập nhật năm bản quyền.
$("currentYear").textContent = new Date().getFullYear();

// Bắt đầu ứng dụng.
initializeData();
