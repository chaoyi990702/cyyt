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
  // 音频 / 视频 / 带 Range 的请求：完全交给浏览器自己处理，Service Worker 不插手。
  // 原因：手机播放音乐时会分段请求（返回 206 局部内容），而 Cache API 不能存 206；
  // 以前每一段都会 clone() 一份响应再存缓存失败，那份 clone 没人读，会把整段音频（最大 40MB）白白留在内存里。
  if (req.headers.has("range") || req.destination === "audio" || req.destination === "video") return;
  try {
    const url = new URL(req.url);
    if (url.origin !== location.origin) return; // 只处理本站资源
    if (/\.(mp3|m4a|aac|wav|flac|ogg|mp4|webm)$/i.test(url.pathname)) return;
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
          // 只缓存完整的(200)且不大的文件；局部内容(206)和大文件不存，也不 clone，避免占内存
          const len = parseInt((res && res.headers && res.headers.get("content-length")) || "0", 10) || 0;
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors") && len < 5 * 1024 * 1024) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
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
