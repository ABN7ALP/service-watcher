// ملف: public/js/giftEngine.js
// 🛡️ feat/gift-display-engine: محرّك عرض الهدايا — منطق خالص بلا أي لمس للـDOM، كي يُختبَر
// مباشرة بـJest (راجع server/utils/__tests__/giftEngine.test.js) بلا محاكاة متصفّح إطلاقاً.
// مصدر الحقيقة الوحيد: حدث gift:sent واحد يصل لكل عضو بالغرفة (بما فيهم المُرسِل نفسه —
// راجع توثيق Tencent RTC الرسمي للهدايا: كل عضو يستقبل نفس الحدث، والمؤثرات تُشغَّل منه فقط لا
// من استجابة نداء الإرسال نفسها). هذا الملف لا يقرر "متى" يصل الحدث — فقط "ماذا يحدث" بعد وصوله:
// ترتيب القوائم (الشريط الجانبي/الطيران/طابور الفيديو)، الدمج، السقوف، والتنظيف — عبر خطّافات
// (hooks) يستدعيها المستدعي (renderer حقيقي بـapp.js) لترسم فعلياً. راجع أيضاً giftEngine.test.js
// لمعرفة العقد الدقيق المُختبَر لكل سلوك (الأسبقية بالطابور، شارة ×N، السقف 20، التنظيف، التجميد).
(function (root, factory) {
    if (typeof module === 'object' && typeof module.exports === 'object') {
        module.exports = factory();
    } else {
        root.GiftStage = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const DEDUPE_CAP = 200;
    const LANE_MAX_VISIBLE = 2;
    const LANE_MERGE_WINDOW_MS = 3000;
    const FLY_MAX_CONCURRENT = 3;
    const VIDEO_QUEUE_CAP = 20; // ✅ يشمل العنصر قيد التشغيل حالياً + المنتظرين معاً (لا المنتظرين وحدهم)
    const VIDEO_MAX_PLAYS_PER_EVENT = 3;
    const HIDDEN_STALE_MS = 30000;

    class GiftStage {
        /**
         * @param {object} hooks
         * @param {(item)=>void} hooks.onLaneShow - عنصر جديد ظهر بالشريط الجانبي
         * @param {(item)=>void} hooks.onLaneMerge - دُمجت هدية بعنصر معروض فعلاً (عدّاده تغيَّر)
         * @param {(item)=>void} hooks.onLaneHide - عنصر اختفى من الشريط (انتهت مهلته)
         * @param {(evt, done)=>void} hooks.onPop - هدية بلا فيديو: صورة مركزية + توهّج ثم استدعِ done()
         * @param {(queueItem, done)=>void} hooks.onVideoPlay - فيديو كامل الشاشة ثم استدعِ done()
         * @param {(queueItem)=>void} [hooks.onVideoPreload] - تحميل العنصر التالي بالطابور فقط سلفاً
         * @param {(evt, recipient)=>void} hooks.onFly - طيران أيقونة لمقعد مستلم واحد (يُستدعى مرة لكل مستلم)
         * @param {()=>number} [hooks.now] - للاختبار: ساعة مُحاكاة بدل Date.now الحقيقية
         */
        constructor(hooks) {
            this.hooks = hooks || {};
            this.now = this.hooks.now || (() => Date.now());
            this._seenOrder = [];
            this._seenSet = new Set();
            this._laneVisible = [];
            this._laneQueue = [];
            this._flyActive = 0;
            this._videoQueue = [];
            this._videoPlaying = false;
            this._hidden = false;
        }

        // ✅ نقطة الدخول الوحيدة — كل تأثير مرئي يبدأ من هنا، ولا من أي مكان آخر (لا تشغيل متفائل
        // محلي للمُرسِل بعد اليوم؛ المُرسِل يستقبل نفس هذا الحدث كبقية الحاضرين بالضبط)
        handleGiftSent(evt) {
            if (!evt || !evt.eventId) return;
            if (this._dedupe(evt.eventId)) return;
            this._laneHandle(evt);
            if (evt.gift && evt.gift.videoUrl) {
                this._videoHandle(evt);
            } else {
                this._popFlyHandle(evt);
            }
        }

        _dedupe(eventId) {
            if (this._seenSet.has(eventId)) return true;
            this._seenSet.add(eventId);
            this._seenOrder.push(eventId);
            if (this._seenOrder.length > DEDUPE_CAP) {
                const oldest = this._seenOrder.shift();
                this._seenSet.delete(oldest);
            }
            return false;
        }

        // ---------------- الشريط الجانبي (أ): أقصى 2 ظاهرَين، دمج بنفس المُرسِل+الهدية خلال 3ث ----------------
        _laneKeyFor(evt) { return `${evt.sender && evt.sender.id}::${evt.gift && evt.gift.id}`; }

        _laneHandle(evt) {
            const key = this._laneKeyFor(evt);
            const now = this.now();
            const visible = this._laneVisible.find(v => v.key === key && (now - v.lastAt) <= LANE_MERGE_WINDOW_MS);
            if (visible) {
                visible.count += (evt.qty || 1);
                visible.lastAt = now;
                (evt.receivers || []).forEach(r => visible.receiverIds.add(r.id));
                this.hooks.onLaneMerge && this.hooks.onLaneMerge(visible);
                return;
            }
            const item = {
                key, sender: evt.sender, gift: evt.gift, count: evt.qty || 1, lastAt: now,
                receiverIds: new Set((evt.receivers || []).map(r => r.id))
            };
            if (this._laneVisible.length >= LANE_MAX_VISIBLE) {
                this._laneQueue.push(item);
                return;
            }
            this._laneVisible.push(item);
            this.hooks.onLaneShow && this.hooks.onLaneShow(item);
        }

        // ✅ يستدعيها الراسم (renderer) عند انتهاء مهلة عرض عنصر بالشريط — المحرّك لا يملك مؤقّتاً
        // داخلياً للعرض نفسه (مدة العرض قرار واجهة)، فقط يقرر "ماذا بعدها" (التالي بالطابور)
        laneExpire(item) {
            const idx = this._laneVisible.indexOf(item);
            if (idx === -1) return;
            this._laneVisible.splice(idx, 1);
            this.hooks.onLaneHide && this.hooks.onLaneHide(item);
            const next = this._laneQueue.shift();
            if (next) {
                this._laneVisible.push(next);
                this.hooks.onLaneShow && this.hooks.onLaneShow(next);
            }
        }

        // ---------------- پop & fly (ب): هدايا بلا فيديو — صورة مركزية ثم طيران، أقصى 3 متزامنة ----------------
        _popFlyHandle(evt) {
            if (this._flyActive >= FLY_MAX_CONCURRENT) return; // ✅ الشريط الجانبي أعلاه كفل رؤية الجميع للهدية أصلاً
            this._flyActive++;
            const onPop = this.hooks.onPop;
            if (!onPop) { this._flyActive = Math.max(0, this._flyActive - 1); return; }
            onPop(evt, () => {
                this._flyToRecipients(evt);
                this._flyActive = Math.max(0, this._flyActive - 1);
            });
        }

        _flyToRecipients(evt) {
            const onFly = this.hooks.onFly;
            if (!onFly) return;
            const recipients = (evt.receivers && evt.receivers.length) ? evt.receivers : [null];
            recipients.forEach(r => onFly(evt, r));
        }

        // ---------------- طابور الفيديو بملء الشاشة (ج): FIFO واحد تلو الآخر، سقف 20 بالأنبوب كله ----------------
        _videoHandle(evt) {
            const inPipeline = this._videoQueue.length + (this._videoPlaying ? 1 : 0);
            if (inPipeline >= VIDEO_QUEUE_CAP) {
                this._popFlyHandle(evt); // ✅ تجاوز السقف: شريط جانبي + طيران فقط، بلا فيديو
                return;
            }
            const qty = evt.qty || 1;
            const plays = Math.min(VIDEO_MAX_PLAYS_PER_EVENT, Math.max(1, qty));
            const createdAt = this.now();
            for (let i = 0; i < plays; i++) {
                this._videoQueue.push({
                    evt, createdAt,
                    isLast: i === plays - 1,
                    badgeQty: (i === plays - 1 && qty > 1) ? qty : null
                });
            }
            this._maybePreloadNext();
            this._playNextVideo();
        }

        // ✅ طلب صريح: لا تحميل مسبق إلا للعنصر "التالي" فقط أثناء تشغيل الحالي — لا الطابور كله
        _maybePreloadNext() {
            if (this._videoPlaying && this._videoQueue.length > 0 && this.hooks.onVideoPreload) {
                this.hooks.onVideoPreload(this._videoQueue[0]);
            }
        }

        _playNextVideo() {
            if (this._videoPlaying || this._hidden) return;
            const item = this._videoQueue.shift();
            if (!item) return;
            this._videoPlaying = true;
            this._maybePreloadNext();
            const onVideoPlay = this.hooks.onVideoPlay;
            if (!onVideoPlay) { this._videoPlaying = false; return; }
            onVideoPlay(item, () => {
                this._flyToRecipients(item.evt);
                this._videoPlaying = false;
                this._playNextVideo();
            });
        }

        // ✅ التطبيق مخفي بالخلفية: الطابور يتوقّف عن التقدّم (لا يُلغي ما يُشغَّل فعلاً — تلك مسؤولية
        // الراسم نفسه عبر Page Visibility إن أراد إيقاف عنصر <video> مؤقتاً). عند العودة: تُسقَط
        // عناصر الطابور الأقدم من 30 ثانية (هدايا لم تعد ذات معنى، لن يراها أحد يعود متأخراً)
        setHidden(hidden) {
            this._hidden = !!hidden;
            if (this._hidden) return;
            const now = this.now();
            this._videoQueue = this._videoQueue.filter(it => (now - it.createdAt) <= HIDDEN_STALE_MS);
            this._playNextVideo();
        }

        // ✅ هل يظهر عنصر بالشريط الجانبي الآن؟ (يستخدمها الراسم لتأجيل عناصر واجهة أخرى تتشارك
        // نفس الحيّز البصري، كسطر "دخل الغرفة" المنزلق، بدل التصادم المساحي بهاتف صغير)
        get laneActive() { return this._laneVisible.length > 0; }

        // ✅ مغادرة الغرفة فعلياً — تطهير كامل، بلا أي بقايا طابور/عدّاد من غرفة سابقة
        leaveRoom() {
            this._laneVisible = [];
            this._laneQueue = [];
            this._flyActive = 0;
            this._videoQueue = [];
            this._videoPlaying = false;
            this._hidden = false;
        }
    }

    GiftStage.LANE_MAX_VISIBLE = LANE_MAX_VISIBLE;
    GiftStage.LANE_MERGE_WINDOW_MS = LANE_MERGE_WINDOW_MS;
    GiftStage.FLY_MAX_CONCURRENT = FLY_MAX_CONCURRENT;
    GiftStage.VIDEO_QUEUE_CAP = VIDEO_QUEUE_CAP;
    GiftStage.VIDEO_MAX_PLAYS_PER_EVENT = VIDEO_MAX_PLAYS_PER_EVENT;
    GiftStage.HIDDEN_STALE_MS = HIDDEN_STALE_MS;
    GiftStage.DEDUPE_CAP = DEDUPE_CAP;

    return GiftStage;
});
