/* service worker — 離線快取 app shell
   ⚠️ 每次改版都要把 CACHE 版本號一起升(和 app.js 的 APP_VERSION 對齊)，否則使用者拿到舊快取 */
const CACHE = 'mahjong-trainer-v0.7.4';
const ASSETS = ['./', 'index.html', 'engine.js', 'defense.js', 'readdiscard.js', 'explain.js', 'tips.js', 'tiles.js', 'app.js', 'style.css', 'manifest.json', 'icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
