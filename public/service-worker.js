// ✅ Service Worker: يخزن الصفحة الرئيسية والأصول الثابتة من نفس الموقع فقط (Same-Origin)
// لا يخزن بيانات API الحية، ولا يتدخل إطلاقاً في أي طلب لموقع خارجي (Cloudinary, Google Fonts,
// cdnjs, cdn.socket.io...) — تلك الطلبات تمر مباشرة عبر المتصفح ليطبّق عليها سياسة CSP
// الصحيحة الخاصة بنوع المورد (img-src / style-src / font-src / script-src)، بدل أن تُصنَّف
// خطأً كطلب "connect" عند إعادة تمريرها عبر fetch() داخل الـ Service Worker.
const CACHE_NAME = 'battle-platform-v2';
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

    // ✅ نتعامل فقط مع طلبات GET القادمة من نفس أصل الموقع (Same-Origin)
    if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) {
        return; // اترك الطلب يمر للمتصفح مباشرة بشكل طبيعي بدون أي تدخل
    }

    // لا نتدخل أبداً في طلبات API أو Socket.io — فقط الملفات الثابتة لنفس الموقع
    if (requestUrl.pathname.startsWith('/api/') || requestUrl.pathname.startsWith('/socket.io/')) return;

    event.respondWith(
        caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
});
