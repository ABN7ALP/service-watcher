// ✅ Service Worker: نسخة v3 — استراتيجية "الشبكة أولاً" للملفات الثابتة
// حتى لا يبقى المستخدمون عالقين على نسخة قديمة من app.js/style.css بعد كل تحديث
const CACHE_NAME = 'battle-platform-v3';
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
    const requestUrl = new URL(event.request.url);

    if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;
    if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/socket.io/')) return;

    // ✅ الشبكة أولاً: يحاول جلب أحدث نسخة دائماً، ويستخدم الكاش فقط إذا انقطع الاتصال
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
