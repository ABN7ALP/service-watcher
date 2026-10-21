// ✅ خارج <script> مضمَّنة عمداً — CSP الحقيقية (server/middleware/globalMiddleware.js) تمنع
// أي سكربت مضمَّن صراحة (script-src بلا 'unsafe-inline')، وهذا صحيح أمنياً ولا يجب تجاوزه هنا

// ✅ نفس قالب المقعد العادي الحقيقي تماماً (راجع app.js، بناء seatEl.innerHTML — avatarHTML +
// .voice-seat-mic-badge)، بلا اسم/رقم مقعد (مخفيّان افتراضياً بلا صنف .labeled بأي حال —
// راجع .voice-seats-flex.labeled .voice-seat-name بـinput.css — فحذفهما هنا بلا أثر بصري)
function buildRegularSeat() {
    const seat = document.createElement('div');
    seat.className = 'voice-seat occupied-seat';
    seat.innerHTML = `
        <div class="voice-seat-av-wrap">
            <span class="avatar voice-seat-avatar fs-live-avatar" style="--frame-scale:1.45;--avatar-scale:0.8;--frame-x:0;--frame-y:0;">
                <img class="avatar__photo" src="/images/default-avatar.webp" alt="">
                <img class="avatar__frame avatar__frame--animated fs-live-frame-img" src="" alt="" aria-hidden="true">
                <img class="avatar__frame avatar__frame--static fs-live-frame-img" src="" alt="" aria-hidden="true">
            </span>
            <span class="voice-seat-mic-badge"><i class="fas fa-microphone"></i></span>
        </div>`;
    return seat;
}
document.querySelectorAll('[data-fs-seats]').forEach((grid) => {
    const n = parseInt(grid.dataset.fsSeats, 10);
    for (let i = 0; i < n; i++) grid.appendChild(buildRegularSeat());
});

// ✅ يُستدعى مباشرة من admin.js (نفس الأصل — بلا postMessage) عند تحريك أي منزلق أو اختيار
// ملف جديد — يُحدِّث كل المقاعد هنا معاً فوراً بنفس القيم الحيّة
window.fsApplyLive = function ({ frameUrl, staticFrameUrl, display }) {
    const vars = `--frame-scale:${display.frameScale};--avatar-scale:${display.avatarScale};--frame-x:${display.offsetX};--frame-y:${display.offsetY}`;
    document.querySelectorAll('.fs-live-avatar').forEach((el) => el.setAttribute('style', vars));
    document.querySelectorAll('.fs-live-crown').forEach((el) => el.style.setProperty('--crown-top', display.crownTop));
    document.querySelectorAll('.avatar__frame--animated.fs-live-frame-img').forEach((img) => { img.src = frameUrl || ''; });
    document.querySelectorAll('.avatar__frame--static.fs-live-frame-img').forEach((img) => { img.src = staticFrameUrl || frameUrl || ''; });
};
