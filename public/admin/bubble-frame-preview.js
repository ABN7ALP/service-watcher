// ✅ خارج <script> مضمَّنة عمداً — CSP الحقيقية (server/middleware/globalMiddleware.js) تمنع
// أي سكربت مضمَّن صراحة (script-src بلا 'unsafe-inline')، وهذا صحيح أمنياً ولا يجب تجاوزه هنا

// ✅ نفس applyRoomChatBubbleFrame الحقيقية بـpublic/js/app.js حرفياً (مكرَّرة عمداً — دالة
// تطبيق أنماط بحتة بلا أي منطق أعمال، خطر انحراف منخفض جداً بين النسختين). تُعيد أي بقايا
// إطار سابق لحالتها الافتراضية أولاً (معاينة حيّة تتبدّل بين "بلا إطار"/"بإطار" مع كل تغيير حقل)
function bfResetBubble(el) {
    el.querySelector('.room-chat-bubble-ornament')?.remove();
    el.removeAttribute('style');
}

function bfApplyFrame(el, cfg) {
    const f = cfg.frame;
    if (!f || !f.url) return;
    el.style.position = 'relative';
    el.style.background = 'transparent';
    el.style.borderStyle = 'solid';
    el.style.borderWidth = '0';
    el.style.borderImageSource = `url(${f.url})`;
    const s = f.slice || {};
    el.style.borderImageSlice = `${s.top ?? 50} ${s.right ?? 50} ${s.bottom ?? 50} ${s.left ?? 50} fill`;
    el.style.borderImageWidth = `${f.borderWidth ?? 18}px`;
    el.style.borderImageOutset = '0';
    el.style.borderImageRepeat = 'stretch';
    el.style.padding = `${f.padY ?? 9}px ${f.padX ?? 16}px`;
    if (f.textColor) el.style.color = f.textColor;
    if (cfg.reserveTop) el.style.marginTop = `${cfg.reserveTop}px`;

    const o = cfg.ornament;
    if (o && o.url) {
        const img = document.createElement('img');
        img.className = 'room-chat-bubble-ornament';
        img.src = o.url;
        img.alt = '';
        img.setAttribute('aria-hidden', 'true');
        img.style.position = 'absolute';
        img.style.pointerEvents = 'none';
        img.style.objectFit = 'contain';
        img.style.width = `${o.width ?? 38}px`;
        img.style.height = `${o.height ?? 26}px`;
        img.style.top = '0px';
        if (o.anchor === 'top-end') img.style.insetInlineEnd = '0px';
        else img.style.insetInlineStart = '0px';
        img.style.transform = `translate(${o.offsetX ?? 0}px, ${o.offsetY ?? 0}px)`;
        el.appendChild(img);
    }
}

// ✅ يُستدعى مباشرة من admin.js (نفس الأصل — بلا postMessage) عند أي تغيير حقل/ملف جديد
window.bfApplyLive = function (cfg) {
    ['bfMsgShort', 'bfMsgMulti', 'bfMsgEn'].forEach((id) => {
        const el = document.getElementById(id);
        bfResetBubble(el);
        bfApplyFrame(el, cfg);
    });
};
