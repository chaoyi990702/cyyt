importScripts('./sw-push.js');
/* ============================================================
   沧澜归屿 · 离线缓存 Service Worker
   - 首次在线打开后，自动缓存页面和音频
   - 之后断网也能打开网站、重播已缓存过的音乐
   - 照片/排版/日记等数据本来就走 localStorage + 离线队列，
     联网后会自动同步到后台，不受此文件影响
   用法：把本文件（sw.js）和 index.html 放在同一个文件夹，
   部署到 HTTPS 环境（如 GitHub Pages）即可生效。
   ============================================================ */
const CACHE_NAME = "cgl-site-v12";   // 每次改了 index.html 想让手机立刻更新，就把这个数字加 1

// 安装：缓存首页核心文件（bgm 等大文件改为"播放过就缓存"，避免首次安装卡住）
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll([new Request("./", { cache: "reload" }), new Request("./index.html", { cache: "reload" })]))
      .then(() => self.skipWaiting())
  );
});

// 激活：清理旧版本缓存
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== "cgl-badge").map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 请求：优先用缓存（离线可用），没有缓存才走网络，成功后再存进缓存
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  try {
    const url = new URL(req.url);
    if (url.origin !== location.origin) return; // 只处理本站资源
  } catch (err) {
    return;
  }
  // 页面本身（首页 / index.html）：优先联网取最新版，离线时才用缓存 —— 这样你更新网站后，手机不用“开两次”就能拿到新版
  const isPage = req.mode === "navigate" || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  if (isPage) {
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then((res) => {
          if (res && res.ok) { const clone = res.clone(); caches.open(CACHE_NAME).then((c) => c.put(req, clone)); }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html") || caches.match("./")))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && (res.type === "basic" || res.type === "cors")) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => {
          // 离线且没缓存：访问页面时回退到首页
          if (req.mode === "navigate") return caches.match("./index.html");
          return new Response("", { status: 503, statusText: "Offline" });
        });
    })
  );
});

/* ============================================================
   宠物通知点击：跳转到宠物板块
   （只处理 tag 以 cgl-pet 开头的通知，其他通知交给 sw-push.js）
   ============================================================ */
self.addEventListener("notificationclick", (e) => {
  const tag = e.notification.tag || "";
  e.notification.close();
  if (tag.indexOf("cgl-pet") !== 0) return;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.focus(); c.postMessage({ type: "cgl-goto", target: "pet" }); return; }
      }
      return self.clients.openWindow("./?goto=pet");
    })
  );
});
