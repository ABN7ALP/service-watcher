// ملف: public/js/giftEngine.js
// 🛡️ feat/gift-display-engine: محرّك عرض الهدايا — منطق خالص بلا أي لمس للـDOM، كي يُختبَر
// مباشرة بـJest (راجع public/js/__tests__/giftEngine.test.js) بلا محاكاة متصفّح إطلاقاً.
// مصدر الحقيقة الوحيد: حدث gift:sent واحد يصل لكل عضو بالغرفة (بما فيهم المُرسِل نفسه —
// راجع توثيق Tencent RTC الرسمي للهدايا: كل عضو يستقبل نفس الحدث، والمؤثرات تُشغَّل منه فقط لا
// من استجابة نداء الإرسال نفسها). هذا الملف لا يقرر "متى" يصل الحدث — فقط "ماذا يحدث" بعد وصوله:
// ترتيب القوائم (الشريط الجانبي/الموكب/طابور الفيديو)، الدمج، السقوف، والتنظيف — عبر خطّافات
// (hooks) يستدعيها المستدعي (renderer حقيقي بـapp.js) لترسم فعلياً.
//
// 🛡️ مراجعة fix/gift-stage-top-layer: إعادة تصميم ثانية — پop&fly البسيط (ب) حُلّ محله "موكب
// مدينة الملاهي" (الهدايا بلا فيديو: وحدات تظهر بصف وسط الشاشة ثم تنطلق بالتناوب للمقاعد)،
// والشريط الجانبي صار يتتبّع "راعي الهدية" (أكبر مُرسِل لكل هدية بهذي الجلسة)، وأُضيف تأثير
// مقعد (كتراكب كرت هوية) لهدايا مُعلَّمة من الأدمن (seatEffect) — مستقل عن مسار الفيديو/الموكب
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
    const VIDEO_QUEUE_CAP = 20; // ✅ يشمل العنصر قيد التشغيل حالياً + المنتظرين معاً (لا المنتظرين وحدهم)
    const VIDEO_MAX_PLAYS_PER_EVENT = 3;
    const HIDDEN_STALE_MS = 30000;
    const PROC_VISIBLE_CAP = 10; // ✅ أقصى وحدات ظاهرة بصف الموكب الواحد (العدّاد يُكمل للرقم الحقيقي دوماً)
    const PROC_VISIBLE_CAP_LITE = 3;
    const PROC_CELEBRATE_THRESHOLD = 10; // ✅ "من ×10 فما فوق: احتفال رقم كبير"

    class GiftStage {
        /**
         * @param {object} hooks
         * @param {(item)=>void} hooks.onLaneShow - عنصر جديد ظهر بالشريط الجانبي
         * @param {(item)=>void} hooks.onLaneMerge - دُمجت هدية بعنصر معروض فعلاً (عدّاده تغيَّر)
         * @param {(item)=>void} hooks.onLaneHide - عنصر اختفى من الشريط (انتهت مهلته)
         * @param {(queueItem, done)=>void} hooks.onVideoPlay - فيديو كامل الشاشة ثم استدعِ done()
         * @param {(queueItem)=>void} [hooks.onVideoPreload] - تحميل العنصر التالي بالطابور فقط سلفاً
         * @param {(evt, recipient)=>void} hooks.onFly - طيران أيقونة بسيطة لمقعد مستلم (بعد انتهاء الفيديو فقط)
         * @param {(proc, done)=>void} hooks.onProcPop - موكب هدايا بلا فيديو: ظهور الوحدات بصف الوسط ثم استدعِ done()
         * @param {(proc)=>void} [hooks.onProcCelebrate] - الكمية الكلية ≥10 — احتفال رقم كبير
         * @param {(proc, unitIndex, recipient)=>void} hooks.onProcLaunch - إطلاق وحدة واحدة نحو مقعد مستلم (بالتناوب)
         * @param {(proc, done)=>void} hooks.onProcDone - انتهاء الموكب بصرياً بالكامل ثم استدعِ done()
         * @param {(proc)=>void} [hooks.onProcExtend] - كومبو من نفس المُرسِل+الهدية مدَّد موكباً قائماً (لا موكب جديد)
         * @param {(evt, recipient)=>void} [hooks.onSeatEffect] - تأثير مقعد (كرت هوية) لهدية مُعلَّمة من الأدمن
         * @param {()=>boolean} [hooks.isLite] - وضع الأجهزة الضعيفة الحالي (يُستعلَم حياً عند كل موكب جديد)
         * @param {()=>number} [hooks.now] - للاختبار: ساعة مُحاكاة بدل Date.now الحقيقية
         */
        constructor(hooks) {
            this.hooks = hooks || {};
            this.now = this.hooks.now || (() => Date.now());
            this._seenOrder = [];
            this._seenSet = new Set();
            this._laneVisible = [];
            this._laneQueue = [];
            this._videoQueue = [];
            this._videoPlaying = false;
            this._hidden = false;
            this._topSenderByGift = new Map(); // giftId → Map(senderId → مجموع الوحدات هذي الجلسة)
            this._procession = null;
            this._procQueue = [];
        }

        // ✅ نقطة الدخول الوحيدة — كل تأثير مرئي يبدأ من هنا، ولا من أي مكان آخر (لا تشغيل متفائل
        // محلي للمُرسِل بعد اليوم؛ المُرسِل يستقبل نفس هذا الحدث كبقية الحاضرين بالضبط)
        handleGiftSent(evt) {
            if (!evt || !evt.eventId) return;
            if (this._dedupe(evt.eventId)) return;
            this._trackTopSender(evt);
            this._laneHandle(evt);
            if (evt.gift && evt.gift.seatEffect) this._seatEffectHandle(evt);
            if (evt.gift && evt.gift.videoUrl) {
                this._videoHandle(evt);
            } else {
                this._procHandle(evt);
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

        // ---------------- راعي الهدية: أكبر مُرسِل لكل هدية بهذي الجلسة (تراكمي، لا يُصفَّر إلا بمغادرة الغرفة) ----------------
        _trackTopSender(evt) {
            const giftId = evt.gift && evt.gift.id;
            const senderId = evt.sender && evt.sender.id;
            if (!giftId || !senderId) return;
            let rec = this._topSenderByGift.get(giftId);
            if (!rec) { rec = new Map(); this._topSenderByGift.set(giftId, rec); }
            const units = this._unitsFor(evt);
            rec.set(senderId, (rec.get(senderId) || 0) + units);
            this._refreshTopSenderTags(giftId);
        }
        _isTopSenderForGift(senderId, giftId) {
            const rec = this._topSenderByGift.get(giftId);
            if (!rec || !senderId) return false;
            let best = null, bestVal = -1;
            rec.forEach((v, k) => { if (v > bestVal) { bestVal = v; best = k; } });
            return best === senderId;
        }
        // 🛡️ fix/gift-stage-top-layer: لمّا يتجاوز مُرسِل جديد الصدارة، الشرائط الظاهرة فعلاً
        // (التي بُنيت سابقاً وهي تحمل isTopSender=true من حينها) يجب أن تخسر الوسم فوراً — لا
        // تُترَك عالقة بلا تحديث (بثّ حيّ، لا تجميد لحظة الظهور — وُجد هذا تحديداً بفحص حيّ: شريطان
        // بتاق "راعي الهدية" معاً حين سبق مُرسِل أولاً فصار الثاني يتفوّق عليه بعدها)
        _refreshTopSenderTags(giftId) {
            const onLaneMerge = this.hooks.onLaneMerge;
            this._laneVisible.forEach(item => {
                if (!item.gift || item.gift.id !== giftId) return;
                const isTop = this._isTopSenderForGift(item.sender && item.sender.id, giftId);
                if (item.isTopSender !== isTop) {
                    item.isTopSender = isTop;
                    onLaneMerge && onLaneMerge(item);
                }
            });
        }

        // ---------------- الشريط الجانبي (أ): أقصى 2 ظاهرَين، دمج بنفس المُرسِل+الهدية خلال 3ث ----------------
        _laneKeyFor(evt) { return `${evt.sender && evt.sender.id}::${evt.gift && evt.gift.id}`; }

        _laneHandle(evt) {
            const key = this._laneKeyFor(evt);
            const now = this.now();
            const isTopSender = this._isTopSenderForGift(evt.sender && evt.sender.id, evt.gift && evt.gift.id);
            const visible = this._laneVisible.find(v => v.key === key && (now - v.lastAt) <= LANE_MERGE_WINDOW_MS);
            if (visible) {
                visible.count += (evt.qty || 1);
                visible.lastAt = now;
                visible.isTopSender = isTopSender;
                (evt.receivers || []).forEach(r => visible.receiverIds.add(r.id));
                this.hooks.onLaneMerge && this.hooks.onLaneMerge(visible);
                return;
            }
            const item = {
                key, sender: evt.sender, gift: evt.gift, count: evt.qty || 1, lastAt: now, isTopSender,
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

        // ---------------- تأثير المقعد: مستقل عن الفيديو/الموكب — مرة لكل مستلم ----------------
        _seatEffectHandle(evt) {
            const onSeatEffect = this.hooks.onSeatEffect;
            if (!onSeatEffect) return;
            const recipients = (evt.receivers && evt.receivers.length) ? evt.receivers : [null];
            recipients.forEach(r => onSeatEffect(evt, r));
        }

        // ---------------- موكب مدينة الملاهي (ب): هدايا بلا فيديو — صفّ وسط ثم إطلاق بالتناوب ----------------
        // ✅ وحدات الحدث = الأكبر بين qty الحقيقية وعدد المستلمين (كي لا يُفقَد أي مستلم من التوزيع
        // حين qty=1 لعدة مستلمين معاً — "وردة لـ3 أشخاص" تعني 3 وحدات تماماً كما كانت پop&fly القديمة)
        _unitsFor(evt) {
            const targetsCount = (evt.receivers && evt.receivers.length) ? evt.receivers.length : 1;
            return Math.max(evt.qty || 1, targetsCount);
        }

        _procHandle(evt) {
            const units = this._unitsFor(evt);
            if (this._procession && this._procession.sender.id === (evt.sender && evt.sender.id) && this._procession.gift.id === (evt.gift && evt.gift.id)) {
                this._procession.realQty += units;
                (evt.receivers || []).forEach(r => {
                    if (r && !this._procession.targetIds.has(r.id)) {
                        this._procession.targetIds.add(r.id);
                        this._procession.targets.push(r);
                    }
                });
                this.hooks.onProcExtend && this.hooks.onProcExtend(this._procession);
                return;
            }
            if (this._procession) { this._procQueue.push(evt); return; }
            this._startProcession(evt, units);
        }

        _startProcession(evt, units) {
            const isLite = !!(this.hooks.isLite && this.hooks.isLite());
            const targets = (evt.receivers && evt.receivers.length) ? evt.receivers.slice() : [null];
            const proc = {
                sender: evt.sender, gift: evt.gift, realQty: units,
                targetIds: new Set(targets.map(t => t && t.id)), targets,
                visibleCap: isLite ? PROC_VISIBLE_CAP_LITE : PROC_VISIBLE_CAP,
                isLite
            };
            this._procession = proc;
            const onPop = this.hooks.onProcPop;
            if (!onPop) { this._finishProcession(); return; }
            onPop(proc, () => {
                if (proc.realQty >= PROC_CELEBRATE_THRESHOLD && this.hooks.onProcCelebrate) this.hooks.onProcCelebrate(proc);
                const shown = Math.min(proc.realQty, proc.visibleCap);
                for (let i = 0; i < shown; i++) {
                    const recipient = proc.targets[i % proc.targets.length];
                    this.hooks.onProcLaunch && this.hooks.onProcLaunch(proc, i, recipient);
                }
                const onDone = this.hooks.onProcDone;
                if (!onDone) { this._finishProcession(); return; }
                onDone(proc, () => this._finishProcession());
            });
        }

        _finishProcession() {
            this._procession = null;
            const next = this._procQueue.shift();
            if (next) this._startProcession(next, this._unitsFor(next));
        }

        // ---------------- طابور الفيديو بملء الشاشة (ج): FIFO واحد تلو الآخر، سقف 20 بالأنبوب كله ----------------
        _videoHandle(evt) {
            const inPipeline = this._videoQueue.length + (this._videoPlaying ? 1 : 0);
            if (inPipeline >= VIDEO_QUEUE_CAP) {
                this._procHandle(evt); // ✅ تجاوز السقف: موكب/شريط جانبي فقط، بلا فيديو
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

        // ✅ طيران بسيط بعد انتهاء الفيديو فقط — مرة لكل مستلم، لا علاقة له بموكب الهدايا بلا فيديو
        _flyToRecipients(evt) {
            const onFly = this.hooks.onFly;
            if (!onFly) return;
            const recipients = (evt.receivers && evt.receivers.length) ? evt.receivers : [null];
            recipients.forEach(r => onFly(evt, r));
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

        // ✅ مغادرة الغرفة فعلياً — تطهير كامل، بلا أي بقايا طابور/عدّاد/موكب/راعي هدية من غرفة سابقة
        leaveRoom() {
            this._laneVisible = [];
            this._laneQueue = [];
            this._videoQueue = [];
            this._videoPlaying = false;
            this._hidden = false;
            this._topSenderByGift.clear();
            this._procession = null;
            this._procQueue = [];
        }
    }

    GiftStage.LANE_MAX_VISIBLE = LANE_MAX_VISIBLE;
    GiftStage.LANE_MERGE_WINDOW_MS = LANE_MERGE_WINDOW_MS;
    GiftStage.VIDEO_QUEUE_CAP = VIDEO_QUEUE_CAP;
    GiftStage.VIDEO_MAX_PLAYS_PER_EVENT = VIDEO_MAX_PLAYS_PER_EVENT;
    GiftStage.HIDDEN_STALE_MS = HIDDEN_STALE_MS;
    GiftStage.DEDUPE_CAP = DEDUPE_CAP;
    GiftStage.PROC_VISIBLE_CAP = PROC_VISIBLE_CAP;
    GiftStage.PROC_VISIBLE_CAP_LITE = PROC_VISIBLE_CAP_LITE;
    GiftStage.PROC_CELEBRATE_THRESHOLD = PROC_CELEBRATE_THRESHOLD;

    return GiftStage;
});
