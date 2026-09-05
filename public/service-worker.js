// ✅ Service Worker بسيط: يخزن الصفحة الرئيسية والأصول الثابتة فقط (لا يخزن بيانات API الحية)
const CACHE_NAME = 'battle-platform-v1';
const STATIC_ASSETS = ['/index.html', '/dist/style.css', '/js/app.js'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // لا نتدخل أبداً في طلبات API أو Socket.io — فقط الملفات الثابتة
    if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) return;
    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});
