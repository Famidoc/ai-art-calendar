// ============================================================================
// AI 繪圖萬年桌面月曆 — PWA Service Worker (支援離線啟動與靜態資源快取)
// ============================================================================
const CACHE_NAME = 'art-calendar-pwa-v4';
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 本機 API 請求 (/api/*) 走網路優先，失敗時直接略過讓前端自動降級使用 IndexedDB
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 靜態資源與頁面：Network-First 搭配 Cache Fallback，確保有網路時取得最新版、無網路時可完整離線使用
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('', { status: 404 });
        })
      )
  );
});
