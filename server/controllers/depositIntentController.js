const mongoose = require('mongoose');
const crypto = require('crypto');
const DepositIntent = require('../models/DepositIntent');
const User = require('../models/User');
const SystemSettings = require('../models/SystemSettings');
const DeviceSession = require('../models/DeviceSession');
const Withdrawal = require('../models/Withdrawal');
const AdminLog = require('../models/AdminLog');
const LedgerEntry = require('../models/LedgerEntry');
const walletService = require('../utils/walletService');
const { uploadReceiptImage, assertRealType } = require('../utils/cloudinary');
const { parseMoneyInput } = require('../utils/money');
const { areLinked } = require('../utils/linkageService');
const { sendBotMessage } = require('../utils/botMessenger');

const ACCOUNT_AGE_RISK_MS = 7 * 24 * 60 * 60 * 1000;

function genRefCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بلا أحرف/أرقام ملتبسة (O/0, I/1)
    let code = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) code += alphabet[bytes[i] % alphabet.length];
    return `SW-${code}`;
}

function computePackageMatch(settings, usd) {
    return (settings.depositPackages || []).find(p => Math.abs(p.usd - usd) < 1e-9) || null;
}

// ✅ حسابات مرتبطة فعلياً بهذا الحساب — جهاز مشترك أو محفظة سحب شام كاش مشتركة فقط (لا IP،
// راجع areLinked بـlinkageService.js لسبب استبعاد IP نهائياً — CGNAT بسوريا). يُستخدمون لمنع
// ازدواج عرض أول شحنة ولعلم الخطر الإداري "linked_accounts"
async function findLinkedCandidateUserIds(userId) {
    const sessions = await DeviceSession.find({ user: userId }).select('deviceId').lean();
    const deviceIds = [...new Set(sessions.filter(s => s.deviceId).map(s => s.deviceId))];
    const withdrawals = await Withdrawal.find({ user: userId, method: 'sham_cash' }).select('walletNumber').lean();
    const wallets = [...new Set(withdrawals.map(w => w.walletNumber).filter(Boolean))];

    const candidates = new Set();
    const [byDevice, byWallet] = await Promise.all([
        deviceIds.length ? DeviceSession.find({ deviceId: { $in: deviceIds }, user: { $ne: userId } }).select('user').lean() : [],
        wallets.length ? Withdrawal.find({ walletNumber: { $in: wallets }, method: 'sham_cash', user: { $ne: userId } }).select('user').lean() : []
    ]);
    [...byDevice, ...byWallet].forEach(r => candidates.add(String(r.user)));
    return [...candidates];
}

// 🛡️ مراجعة PR (بند 1): عدد الحسابات الأخرى المشتركة بنفس IP — إشارة خطر إدارية بحتة لعرضها
// بطابور المراجعة فقط ("نفس IP مع N حسابات")، لا تُستخدَم أبداً لتغيير beans_w→beans_p ولا
// لحظر بونص أول شحنة (شبكات الجوال بسوريا تشترك بـIP واحد بين آلاف المستخدمين الحقيقيين)
async function findSameIpAccountCount(userId) {
    const sessions = await DeviceSession.find({ user: userId }).select('ip').lean();
    const ips = [...new Set(sessions.filter(s => s.ip).map(s => s.ip))];
    if (!ips.length) return 0;
    const rows = await DeviceSession.find({ ip: { $in: ips }, user: { $ne: userId } }).select('user').lean();
    return new Set(rows.map(r => String(r.user))).size;
}

async function hasLinkedAccountConsumedFirstRecharge(userId) {
    const candidates = await findLinkedCandidateUserIds(userId);
    if (!candidates.length) return false;
    const consumed = await User.find({ _id: { $in: candidates }, firstRechargeBonusConsumedAt: { $ne: null } }).select('_id').lean();
    for (const c of consumed) {
        if (await areLinked(userId, c._id)) return true;
    }
    return false;
}

async function isFirstRechargeEligible(userId, user) {
    const u = user || await User.findById(userId).select('firstRechargeBonusConsumedAt').lean();
    if (!u || u.firstRechargeBonusConsumedAt) return false;
    return !(await hasLinkedAccountConsumedFirstRecharge(userId));
}

// 🛡️ مراجعة PR (بند 3): نافذة عرض "أول شحنة" الزمنية — تبدأ فقط من أول مشاهدة فعلية لصفحة
// المحفظة (walletFirstViewedAt، تُضبَط بـgetSummary). لا نافذة بعد (null) = لم تبدأ = غير نشطة
function computeFirstRechargeWindow(user, settings) {
    const endsAt = user?.walletFirstViewedAt
        ? new Date(user.walletFirstViewedAt.getTime() + settings.firstRechargeOfferHours * 3600000)
        : null;
    const active = !!endsAt && endsAt.getTime() > Date.now();
    return { endsAt, active };
}

// =====================================================
// 📄 GET /api/wallet/summary
// =====================================================
exports.getSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const settings = await SystemSettings.getSettings();

        // ✅ عدّاد "أول شحنة" يبدأ من أول مشاهدة فعلية لصفحة المحفظة — شرط المساواة بـnull يمنع
        // إعادة ضبطه لاحقاً (default الحقل null صراحة، لا $exists)
        await User.updateOne({ _id: userId, walletFirstViewedAt: null }, { $set: { walletFirstViewedAt: new Date() } });

        const user = await User.findById(userId)
            .select('walletCoinsPaid walletCoinsBonus walletBeansW walletBeansP walletUsdCents walletFirstViewedAt firstRechargeBonusConsumedAt');

        const eligibleFirst = !!settings.firstRechargeEnabled && (await isFirstRechargeEligible(userId, user));
        const { endsAt: firstEndsAt, active: windowActive } = computeFirstRechargeWindow(user, settings);
        const firstActive = eligibleFirst && windowActive;

        const packages = (settings.depositPackages || []).map(p => ({
            usd: p.usd,
            bonusPct: p.bonusPct || 0,
            hot: !!p.hot,
            coins: Math.round(p.usd * settings.coinsPerUsd * (1 + (p.bonusPct || 0) / 100))
        }));

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const monthAgg = await DepositIntent.aggregate([
            { $match: { user: user._id, status: 'approved', processedAt: { $gte: monthStart } } },
            { $group: { _id: null, total: { $sum: '$amountUsd' } } }
        ]);
        const monthToDateUsd = monthAgg[0]?.total || 0;

        const openIntents = await DepositIntent.find({ user: userId, status: { $in: ['awaiting_payment', 'submitted'] } })
            .sort('-createdAt');

        res.status(200).json({
            status: 'success',
            data: {
                balances: {
                    coins: user.walletCoinsPaid + user.walletCoinsBonus,
                    beansWithdrawable: user.walletBeansW,
                    beansInApp: user.walletBeansP,
                    usd: Math.round(user.walletUsdCents) / 100
                },
                coinsPerUsd: settings.coinsPerUsd,
                maxDepositUsd: settings.maxDepositUsd,
                shamCashBonusPct: settings.shamCashBonusPct,
                shamCash: {
                    walletNumber: settings.shamCashWallet,
                    accountHolderName: settings.shamCashHolderName,
                    qrImageUrl: settings.shamCashQrUrl
                },
                packages,
                firstRecharge: {
                    eligible: !!eligibleFirst,
                    active: !!firstActive,
                    endsAt: firstEndsAt,
                    multiplierUpToUsd: settings.firstRechargeMultiplierUpToUsd
                },
                monthToDateUsd,
                openIntents
            }
        });
    } catch (error) {
        console.error('[ERROR] in wallet.getSummary:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =====================================================
// 📄 GET /api/wallet/history — سجل آخر حركات دفتر الأستاذ لهذا المستخدم فقط
// =====================================================
exports.getHistory = async (req, res) => {
    try {
        const entries = await LedgerEntry.find({ user: req.user.id }).sort('-createdAt').limit(50);
        res.status(200).json({ status: 'success', data: { entries } });
    } catch (error) {
        console.error('[ERROR] in wallet.getHistory:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =====================================================
// 📄 POST /api/wallet/deposits
// =====================================================
exports.createDeposit = async (req, res) => {
    try {
        // 🛡️ امتثال Google Play: نسخة المتجر ممنوعة من إنشاء أي طلب شحن مهما كان المصدر
        if (req.headers['x-client'] === 'play') {
            return res.status(403).json({ status: 'fail', message: 'الشحن غير متاح داخل نسخة Google Play' });
        }

        const userId = req.user.id;
        const [settings, user] = await Promise.all([
            SystemSettings.getSettings(),
            User.findById(userId).select('firstRechargeBonusConsumedAt walletFirstViewedAt')
        ]);

        const usd = parseMoneyInput(req.body.usd, { min: 1, max: settings.maxDepositUsd });
        if (usd === null) {
            return res.status(400).json({ status: 'fail', message: `المبلغ يجب أن يكون بين 1$ و ${settings.maxDepositUsd}$` });
        }

        const openCount = await DepositIntent.countDocuments({
            user: userId, status: { $in: ['awaiting_payment', 'submitted'] }
        });
        if (openCount >= settings.maxOpenDepositIntentsPerUser) {
            return res.status(400).json({
                status: 'fail',
                message: `لديك ${openCount} طلبات شحن مفتوحة فعلاً — أكمل أو انتظر انتهاءها قبل إنشاء طلب جديد`
            });
        }

        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const todayAgg = await DepositIntent.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(userId),
                    status: { $in: ['awaiting_payment', 'submitted', 'approved'] },
                    createdAt: { $gte: dayStart }
                }
            },
            { $group: { _id: null, total: { $sum: '$amountUsd' } } }
        ]);
        const todayTotal = todayAgg[0]?.total || 0;
        if (todayTotal + usd > settings.dailyDepositCapUsd) {
            return res.status(400).json({
                status: 'fail',
                message: `تجاوزت الحد اليومي للشحن (${settings.dailyDepositCapUsd}$)`
            });
        }

        // ✅ لقطة الكوينز/البونصات وقت الإنشاء — لا تتأثر بأي تعديل إعدادات لاحق قبل الموافقة
        const baseCoins = Math.round(usd * settings.coinsPerUsd);
        const bonusLines = [];
        const pkg = computePackageMatch(settings, usd);
        if (pkg && pkg.bonusPct > 0) {
            bonusLines.push({
                type: 'package',
                coins: Math.round(baseCoins * pkg.bonusPct / 100),
                reason: `بونص باقة ${usd}$ (+${pkg.bonusPct}%)`
            });
        }
        if (settings.shamCashBonusPct > 0) {
            bonusLines.push({
                type: 'method',
                coins: Math.round(baseCoins * settings.shamCashBonusPct / 100),
                reason: `بونص شام كاش (+${settings.shamCashBonusPct}%)`
            });
        }
        // 🛡️ مراجعة PR (بند 3): اللقطة تتضمّن بونص "أول شحنة" فقط إن كانت النافذة الزمنية نشطة
        // فعلياً وقت الإنشاء (walletFirstViewedAt + firstRechargeOfferHours لم تنتهِ بعد) — لا
        // يكفي الاستحقاق المنطقي وحده (عدم الاستهلاك + عدم الارتباط)
        if (settings.firstRechargeEnabled
            && computeFirstRechargeWindow(user, settings).active
            && await isFirstRechargeEligible(userId, user)) {
            const firstUsd = Math.min(usd, settings.firstRechargeMultiplierUpToUsd);
            const firstCoins = Math.round(firstUsd * settings.coinsPerUsd);
            if (firstCoins > 0) {
                bonusLines.push({
                    type: 'first_recharge',
                    coins: firstCoins,
                    reason: `مضاعفة أول شحنة (حتى ${settings.firstRechargeMultiplierUpToUsd}$)`
                });
            }
        }
        const totalCoinsSnapshot = baseCoins + bonusLines.reduce((s, b) => s + b.coins, 0);
        const expiresAt = new Date(Date.now() + settings.depositIntentExpiryMinutes * 60000);
        const baseCents = Math.round(usd * 100);

        // ✅ سنتات فريدة (01-99) بين الطلبات "المفتوحة" بنفس المبلغ الأساسي — الفهرس الجزئي
        // الفريد بـDepositIntent هو الضامن الذري الحقيقي؛ هذه الحلقة مجرد إعادة محاولة عند تعارض
        let created = null;
        let lastError = null;
        for (let attempt = 0; attempt < 20 && !created; attempt++) {
            const cents = Math.floor(Math.random() * 99) + 1;
            try {
                created = await DepositIntent.create({
                    user: userId,
                    refCode: genRefCode(),
                    amountUsd: usd,
                    exactAmountCents: baseCents + cents,
                    baseCoins,
                    bonusLines,
                    totalCoinsSnapshot,
                    expiresAt
                });
            } catch (e) {
                if (e.code === 11000) { lastError = e; continue; }
                throw e;
            }
        }
        if (!created) {
            console.error('[DEPOSIT] تعذّر تخصيص سنتات/رمز فريد بعد عدة محاولات:', lastError);
            return res.status(503).json({ status: 'fail', message: 'الخادم مزدحم حالياً، حاول مجدداً بعد لحظات' });
        }

        res.status(201).json({ status: 'success', data: { intent: created } });
    } catch (error) {
        console.error('[ERROR] in createDeposit:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =====================================================
// 📄 POST /api/wallet/deposits/:id/submit
// =====================================================
exports.submitDeposit = async (req, res) => {
    try {
        const userId = req.user.id;
        const { id } = req.params;

        // 🛡️ مراجعة PR (بند 2): شكل المعرّف أولاً — منع CastError وأي استعلام بمعرّف فاسد
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });
        }

        const digitsOnly = String(req.body.txnNo || '').replace(/\D/g, '');
        if (digitsOnly.length < 4 || digitsOnly.length > 30) {
            return res.status(400).json({ status: 'fail', message: 'رقم العملية غير صالح' });
        }

        // ✅ الملكية/الحالة/الصلاحية تُتحقَّق قبل لمس أي ملف مرفوع إطلاقاً — لا رفع لـCloudinary
        // لطلب ليس ملك هذا المستخدم أو تجاوز حالته awaiting_payment (التحديث الذرّي أدناه يبقى
        // الحارس الفعلي ضد أي سباق بين هذا الفحص والتحديث؛ هذا فحص مبكر فقط يوفّر رفعاً عديم الجدوى)
        const precheck = await DepositIntent.findOne({ _id: id, user: userId }).select('status expiresAt');
        if (!precheck) return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });
        if (precheck.status !== 'awaiting_payment') {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن تعديل هذا الطلب بعد الآن' });
        }
        if (precheck.expiresAt <= new Date()) {
            return res.status(400).json({ status: 'fail', message: 'انتهت صلاحية هذا الطلب (30 دقيقة) — أنشئ طلباً جديداً' });
        }

        let receiptImage = null;
        let receiptHash = null;
        let duplicateHash = false;
        if (req.file) {
            // 🛡️ مراجعة PR (بند 2): الفحص الحاسم على البايتات الفعلية (لا mimetype المُرسَل من
            // العميل وحده — receiptUpload middleware يفلتره أولياً فقط) — jpeg/png/webp حصراً
            try {
                assertRealType(req.file.buffer, ['image/jpeg', 'image/png', 'image/webp']);
            } catch (typeError) {
                return res.status(400).json({ status: 'fail', message: typeError.message });
            }
            receiptHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
            duplicateHash = await DepositIntent.exists({ receiptHash, _id: { $ne: id } });
            const uploadResult = await uploadReceiptImage(req.file.buffer);
            receiptImage = uploadResult.secure_url;
        }

        const setFields = { status: 'submitted', submittedAt: new Date(), txnNo: digitsOnly };
        if (receiptImage) setFields.receiptImage = receiptImage;
        if (receiptHash) setFields.receiptHash = receiptHash;
        const update = { $set: setFields };
        if (duplicateHash) update.$addToSet = { riskFlags: 'duplicate_receipt_hash' };

        let intent;
        try {
            intent = await DepositIntent.findOneAndUpdate(
                { _id: id, user: userId, status: 'awaiting_payment', expiresAt: { $gt: new Date() } },
                update,
                { new: true }
            );
        } catch (e) {
            if (e.code === 11000) {
                return res.status(409).json({ status: 'fail', message: 'رقم العملية هذا مُستخدَم من قبل في طلب آخر — لا يمكن استخدام نفس الإيصال مرتين' });
            }
            throw e;
        }

        if (!intent) {
            const existing = await DepositIntent.findOne({ _id: id, user: userId }).select('status');
            if (!existing) return res.status(404).json({ status: 'fail', message: 'الطلب غير موجود' });
            if (existing.status !== 'awaiting_payment') {
                return res.status(400).json({ status: 'fail', message: 'لا يمكن تعديل هذا الطلب بعد الآن' });
            }
            return res.status(400).json({ status: 'fail', message: 'انتهت صلاحية هذا الطلب (30 دقيقة) — أنشئ طلباً جديداً' });
        }

        res.status(200).json({
            status: 'success',
            message: 'تم استلام طلبك، سيتم إيداع الكوينز بعد مطابقة التحويل',
            data: { intent }
        });
    } catch (error) {
        console.error('[ERROR] in submitDeposit:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم أثناء إرسال الطلب' });
    }
};

// =====================================================
// 🛡️ لوحة الإدارة — طلبات الشحن
// =====================================================
exports.adminListIntents = async (req, res) => {
    try {
        const { status = 'submitted', page = 1, limit = 30 } = req.query;
        const query = {};
        if (status !== 'all') query.status = status;

        const intents = await DepositIntent.find(query)
            .populate('user', 'username profileImage customId createdAt')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const total = await DepositIntent.countDocuments(query);

        const enriched = await Promise.all(intents.map(async (intent) => {
            const riskFlags = new Set(intent.riskFlags || []);
            if (intent.user && Date.now() - new Date(intent.user.createdAt).getTime() < ACCOUNT_AGE_RISK_MS) {
                riskFlags.add('account_under_7_days');
            }
            if (intent.user) {
                const candidates = await findLinkedCandidateUserIds(intent.user._id);
                if (candidates.length > 0) riskFlags.add('linked_accounts');
                // ✅ مراجعة PR (بند 1): إشارة خطر عرض فقط — لا تدخل أبداً بمنطق الحظر/beans_p
                const sameIpCount = await findSameIpAccountCount(intent.user._id);
                if (sameIpCount > 0) riskFlags.add(`same_ip:${sameIpCount}`);
                const priorRejections = await DepositIntent.countDocuments({ user: intent.user._id, status: 'rejected' });
                if (priorRejections > 0) riskFlags.add(`previous_rejections:${priorRejections}`);
            }
            const obj = intent.toObject();
            obj.riskFlags = [...riskFlags];
            return obj;
        }));

        res.json({ success: true, intents: enriched, totalPages: Math.ceil(total / limit), currentPage: parseInt(page) });
    } catch (error) {
        console.error('[ERROR] in adminListIntents:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminApproveIntent = async (req, res) => {
    try {
        const { id } = req.params;
        const session = await mongoose.startSession();
        let intent = null;
        let user = null;
        try {
            await session.withTransaction(async () => {
                intent = await DepositIntent.findOneAndUpdate(
                    { _id: id, status: 'submitted' },
                    { $set: { status: 'approved', processedBy: req.admin._id, processedAt: new Date() } },
                    { new: true, session }
                );
                if (!intent) {
                    throw Object.assign(new Error('هذا الطلب ليس قيد المراجعة حالياً'), { code: 'NOT_PENDING' });
                }

                const entries = [{
                    user: intent.user, wallet: 'coins_paid', delta: intent.baseCoins, type: 'coin_purchase',
                    refType: 'DepositIntent', refId: intent._id, idempotencyKey: `${intent._id}:base`,
                    meta: { reason: 'شحن أساسي', refCode: intent.refCode }
                }];

                for (const line of intent.bonusLines) {
                    if (line.type === 'first_recharge') {
                        // ✅ ادّعاء ذرّي لهذا الحساب فقط (يمنع موافقتين متزامنتين على طلبين لنفس
                        // المستخدم من منح البونص مرتين) — إن كان مُستهلَكاً فعلاً نتخطّى هذا البند فقط
                        const claimed = await User.findOneAndUpdate(
                            { _id: intent.user, firstRechargeBonusConsumedAt: null },
                            { $set: { firstRechargeBonusConsumedAt: new Date() } },
                            { session }
                        );
                        if (!claimed) continue;
                        // ✅ إعادة تحقق أخيرة: حساب مرتبط استهلك العرض بين إنشاء الطلب والموافقة عليه
                        if (await hasLinkedAccountConsumedFirstRecharge(intent.user)) continue;
                    }
                    entries.push({
                        user: intent.user, wallet: 'coins_bonus', delta: line.coins, type: 'bonus',
                        refType: 'DepositIntent', refId: intent._id, idempotencyKey: `${intent._id}:bonus:${line.type}`,
                        meta: { reason: line.reason }
                    });
                }

                // 🛡️ مراجعة PR (بند 4): المُودَع فعلياً — قد يقل عن totalCoinsSnapshot لو أُسقِط
                // بند "أول شحنة" أعلاه (حساب مرتبط استهلك العرض بين الإنشاء والموافقة)
                const creditedCoins = entries.reduce((sum, e) => sum + e.delta, 0);
                await DepositIntent.updateOne({ _id: intent._id }, { $set: { creditedCoins } }, { session });
                intent.creditedCoins = creditedCoins;

                await walletService.post(entries, session);
                user = await User.findById(intent.user).select('coins socketId').session(session);
            });
        } catch (txError) {
            if (txError.code === 'NOT_PENDING') {
                const exists = await DepositIntent.exists({ _id: id });
                if (!exists) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
                return res.status(409).json({ success: false, message: txError.message });
            }
            throw txError;
        } finally {
            await session.endSession();
        }

        const io = req.app.get('socketio');
        if (user) {
            if (io && user.socketId) {
                io.to(user.socketId).emit('coinsUpdated', { newCoins: user.coins, intentId: intent._id, creditedCoins: intent.creditedCoins });
            }
            await sendBotMessage(io, intent.user, `تم إيداع ${intent.creditedCoins} كوينز في حسابك بنجاح 🪙 (${intent.refCode})\nرصيدك الحالي: ${user.coins} كوينز`);
        }

        await AdminLog.logAction({
            admin: req.admin._id, action: 'approve_deposit', targetUser: intent.user,
            targetEntity: 'transaction', entityId: intent._id,
            details: { type: 'deposit_intent', refCode: intent.refCode, totalCoinsSnapshot: intent.totalCoinsSnapshot, creditedCoins: intent.creditedCoins },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'تمت الموافقة وإيداع الكوينز بنجاح', intent });
    } catch (error) {
        console.error('[ERROR] in adminApproveIntent:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.adminRejectIntent = async (req, res) => {
    try {
        const { id } = req.params;
        const reason = (req.body.reason || '').trim();
        if (!reason) {
            return res.status(400).json({ success: false, message: 'سبب الرفض مطلوب' });
        }

        const intent = await DepositIntent.findOneAndUpdate(
            { _id: id, status: { $in: ['awaiting_payment', 'submitted'] } },
            { $set: { status: 'rejected', rejectionReason: reason, processedBy: req.admin._id, processedAt: new Date() } },
            { new: true }
        );
        if (!intent) {
            const exists = await DepositIntent.exists({ _id: id });
            if (!exists) return res.status(404).json({ success: false, message: 'الطلب غير موجود' });
            return res.status(400).json({ success: false, message: 'لا يمكن رفض طلب تمت معالجته مسبقاً' });
        }

        const io = req.app.get('socketio');
        const userDoc = await User.findById(intent.user).select('socketId');
        if (io && userDoc?.socketId) {
            io.to(userDoc.socketId).emit('depositIntentRejected', { intentId: intent._id, reason: intent.rejectionReason });
        }
        await sendBotMessage(io, intent.user, `❌ تم رفض طلب الشحن (${intent.refCode}).\nالسبب: ${intent.rejectionReason}`);

        await AdminLog.logAction({
            admin: req.admin._id, action: 'reject_deposit', targetUser: intent.user,
            targetEntity: 'transaction', entityId: intent._id,
            details: { type: 'deposit_intent', refCode: intent.refCode, reason: intent.rejectionReason },
            ipAddress: req.ip
        });

        res.json({ success: true, message: 'تم رفض الطلب', intent });
    } catch (error) {
        console.error('[ERROR] in adminRejectIntent:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// ✅ مُصدَّرة للاختبار المباشر
exports.isFirstRechargeEligible = isFirstRechargeEligible;
exports.findLinkedCandidateUserIds = findLinkedCandidateUserIds;
exports.findSameIpAccountCount = findSameIpAccountCount;
exports.computeFirstRechargeWindow = computeFirstRechargeWindow;
