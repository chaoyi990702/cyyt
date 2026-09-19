/* sw-push.js —— 手机通知（Web Push）处理
 * 用法：在你现有 sw.js 的【第一行】加上：
 *     importScripts('./sw-push.js');
 * 这样不会动到你原来的离线缓存逻辑。
 */
self.addEventListener('push', function (event) {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { body: event.data ? event.data.text() : '' }; }

  const title = d.title || '沧澜归屿';
  const options = {
    body: d.body || '有新的消息',
    icon: 'icon.jpeg',
    badge: 'icon.jpeg',
    tag: d.tag || 'cgl',        // 同一类通知会合并，不会刷屏
    renotify: true,
    data: { url: d.url || './' }
  };

  event.waitUntil((async function () {
    const ua = (self.navigator && self.navigator.userAgent) || '';
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 正在看网站时：安卓/电脑不重复弹系统通知（页面里已有实时提示）。
    // iPhone 要求每次推送都必须显示通知，所以 iOS 一律显示。
    const looking = wins.some(function (w) { return w.visibilityState === 'visible' && w.focused; });
    if (looking && !isIOS) return;
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil((async function () {
    const target = new URL(url, self.registration.scope);
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.indexOf(self.registration.scope) === 0) {
        await w.focus();
        const goto = target.searchParams.get('goto');
        if (goto) w.postMessage({ type: 'cgl-goto', target: goto });
        return;
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
