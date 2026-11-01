// ✅ feat/agents-v1: وكلاء شحن معتمدون بمخزون مدفوع مسبقاً. walletService.post يبقى الطريقة
// الوحيدة المخوَّلة بتحريك أي رصيد — كل تحويل هنا ذرّي ضمن معاملة Mongo واحدة.
const mongoose = require('mongoose');
const User = require('../models/User');
const Agent = require('../models/Agent');
const AgentPurchase = require('../models/AgentPurchase');
const AgentTransfer = require('../models/AgentTransfer');
const AgentDailyCounter = require('../models/AgentDailyCounter');
const SystemSettings = require('../models/SystemSettings');
const walletService = require('../utils/walletService');
const linkageService = require('../utils/linkageService');
const pinService = require('../utils/withdrawalPinService');
const { computeAgentTier, rateForTier } = require('../utils/agentTierService');
const { sendBotMessage } = require('../utils/botMessenger');

async function getAgentForUser(userId) {
    return Agent.findOne({ user: userId });
}

// ===== مستخدم: قائمة الوكلاء المعتمدين (نشطون، مرتّبون: متصل أولاً ثم الأعلى تقييماً) =====
exports.listActiveAgents = async (req, res) => {
    try {
        const settings = await SystemSettings.getSettings();
        const agents = await Agent.find({ status: 'active' })
            .populate('user', 'username profileImage isOnline customId')
            .lean();

        const enriched = await Promise.all(agents.map(async (a) => {
            const tier = await computeAgentTier(a._id, a.tierOverride);
            return {
                _id: a._id,
                displayName: a.displayName,
                user: a.user,
                tier,
                ratePerUsd: rateForTier(tier, settings),
                rating: a.ratingCount > 0 ? Math.round((a.ratingSum / a.ratingCount) * 10) / 10 : 0,
                ratingCount: a.ratingCount,
                totalTransfers: a.totalTransfers,
                online: !!(a.user && a.user.isOnline)
            };
        }));

        enriched.sort((x, y) => (y.online - x.online) || (y.rating - x.rating));
        res.status(200).json({ status: 'success', data: { agents: enriched } });
    } catch (error) {
        console.error('[ERROR] in listActiveAgents:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== وكيل: ملفي (مخزون + فئة + حالة) =====
exports.getMyAgentProfile = async (req, res) => {
    try {
        const agent = await getAgentForUser(req.user.id);
        if (!agent) return res.status(404).json({ status: 'fail', message: 'لست وكيلاً' });

        const settings = await SystemSettings.getSettings();
        const user = await User.findById(req.user.id).select('walletAgentInventory');
        const tier = await computeAgentTier(agent._id, agent.tierOverride);

        res.status(200).json({
            status: 'success',
            data: {
                status: agent.status,
                tier,
                ratePerUsd: rateForTier(tier, settings),
                inventoryCoins: user.walletAgentInventory,
                rating: agent.ratingCount > 0 ? Math.round((agent.ratingSum / agent.ratingCount) * 10) / 10 : 0,
                ratingCount: agent.ratingCount,
                totalTransfers: agent.totalTransfers,
                totalCoinsTransferred: agent.totalCoinsTransferred,
                limits: {
                    min: settings.agentTransferMinCoins,
                    max: settings.agentTransferMaxCoins,
                    dailyCap: settings.agentDailyCapCoins
                }
            }
        });
    } catch (error) {
        console.error('[ERROR] in getMyAgentProfile:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.getMyTransfers = async (req, res) => {
    try {
        const agent = await getAgentForUser(req.user.id);
        if (!agent) return res.status(404).json({ status: 'fail', message: 'لست وكيلاً' });

        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const [today, history] = await Promise.all([
            AgentTransfer.find({ agent: agent._id, createdAt: { $gte: startOfToday } })
                .populate('toUser', 'username profileImage customId').sort('-createdAt'),
            AgentTransfer.find({ agent: agent._id }).populate('toUser', 'username profileImage customId')
                .sort('-createdAt').limit(100)
        ]);
        res.status(200).json({ status: 'success', data: { today, history } });
    } catch (error) {
        console.error('[ERROR] in getMyTransfers:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== وكيل: بحث سريع عن مستخدم بمعرّفه (بطاقة التأكيد قبل التحويل) =====
exports.lookupUserByCustomId = async (req, res) => {
    try {
        const agent = await getAgentForUser(req.user.id);
        if (!agent) return res.status(403).json({ status: 'fail', message: 'لست وكيلاً' });

        const customId = String(req.query.customId || '').trim();
        if (!customId) return res.status(400).json({ status: 'fail', message: 'أدخل معرّف المستخدم' });

        const user = await User.findOne({ customId }).select('username profileImage customId');
        if (!user) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        res.status(200).json({ status: 'success', data: { user } });
    } catch (error) {
        console.error('[ERROR] in lookupUserByCustomId:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== وكيل: تحويل كوينز لمستخدم =====
exports.transfer = async (req, res) => {
    try {
        const { toCustomId, coins, clientRequestId, pin } = req.body;
        const agentUserId = req.user.id;

        if (!clientRequestId || typeof clientRequestId !== 'string') {
            return res.status(400).json({ status: 'fail', message: 'معرّف الطلب مفقود' });
        }
        const coinsInt = Math.floor(Number(coins));
        if (!Number.isInteger(coinsInt) || coinsInt <= 0) {
            return res.status(400).json({ status: 'fail', message: 'عدد كوينز غير صالح' });
        }

        const agent = await getAgentForUser(agentUserId);
        if (!agent) return res.status(403).json({ status: 'fail', message: 'لست وكيلاً' });
        if (agent.status !== 'active') {
            return res.status(403).json({ status: 'fail', message: 'حساب الوكيل موقوف حالياً' });
        }

        const settings = await SystemSettings.getSettings();
        if (coinsInt < settings.agentTransferMinCoins) {
            return res.status(400).json({ status: 'fail', message: `الحد الأدنى للتحويل ${settings.agentTransferMinCoins} كوينز` });
        }
        if (coinsInt > settings.agentTransferMaxCoins) {
            return res.status(400).json({ status: 'fail', message: `الحد الأقصى للتحويل الواحد ${settings.agentTransferMaxCoins} كوينز` });
        }
        // ✅ فحص مبكر رخيص فقط (تحويل واحد يتجاوز السقف اليومي كاملاً وحده) — ليس الحارس الأمني
        // الحقيقي؛ ذاك هو الزيادة الذرّية بشرط داخل المعاملة أدناه (AgentDailyCounter)
        if (coinsInt > settings.agentDailyCapCoins) {
            return res.status(400).json({ status: 'fail', message: `يتجاوز هذا المبلغ الحد اليومي للتحويلات (${settings.agentDailyCapCoins} كوينز)` });
        }

        // ✅ رمز السحب (withdrawalPinService، fix/wallet-pin-and-polish) — مفعَّل افتراضياً
        // (agentTransferRequirePin)، قابل للتعطيل من لوحة الإدارة عند الحاجة فقط
        if (settings.agentTransferRequirePin) {
            const pinResult = await pinService.verifyWithdrawalPin(agentUserId, pin, req.app.get('socketio'));
            if (!pinResult.ok) {
                const isLockStatus = pinResult.code === 'LOCKED' || pinResult.code === 'LOCKED_NOW' || pinResult.code === 'HARD_LOCKED';
                return res.status(isLockStatus ? 423 : 400).json({
                    status: 'fail', code: pinResult.code,
                    message: pinResult.code === 'NOT_SET' ? 'يرجى إنشاء رمز سحب أولاً' : 'رمز السحب غير صحيح',
                    lockedUntil: pinResult.lockedUntil || null,
                    remainingAttempts: pinResult.remainingAttempts
                });
            }
        }

        const toUser = await User.findOne({ customId: String(toCustomId || '').trim() }).select('_id username socketId');
        if (!toUser) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });
        if (String(toUser._id) === String(agentUserId)) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكنك تحويل كوينز لحسابك الخاص' });
        }
        const linked = await linkageService.areLinked(agentUserId, toUser._id);
        if (linked) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن التحويل لحساب مرتبط بحسابك' });
        }

        // ✅ إعادة إرسال بنفس clientRequestId (شبكة متقطعة) تُعيد النتيجة السابقة بدل التكرار
        const existing = await AgentTransfer.findOne({ agent: agent._id, clientRequestId });
        if (existing) {
            return res.status(200).json({ status: 'success', message: 'تم التحويل مسبقاً', data: { transfer: existing } });
        }

        // 🛡️ مراجعة أمنية (تدقيق ما بعد الفتح): الفحص السابق كان تجميعاً (aggregate) خارج معاملة
        // التحويل — عدّة تحويلات متزامنة تقرأ نفس "إجمالي اليوم" القديم معاً فتتجاوز السقف جماعياً.
        // الآن: AgentDailyCounter بفهرس فريد {agent, day} + زيادة ذرّية بشرط ضمن نفس معاملة
        // التحويل (أدناه) — تجاوز السقف يُسقِط المعاملة كاملة (DAILY_CAP_EXCEEDED)
        const dayKey = new Date().toISOString().slice(0, 10);
        const idemBase = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        let transferDoc = null;
        try {
            await session.withTransaction(async () => {
                // ✅ خطوتان: الأولى تضمن وجود مستند العدّاد (upsert صِرف بلا شرط نطاق — تكراره
                // بالتزامن آمن تماماً، أي تعارض حقيقي على نفس {agent,day} يُسقِط المعاملة فتُعاد
                // محاولتها تلقائياً عبر session.withTransaction، لا E11000 يتسرّب إطلاقاً). الثانية
                // هي الزيادة الذرّية الحقيقية بشرط السقف — بلا upsert هنا، ففشل الشرط يُعيد null
                // بأمان (لا محاولة إدراج تصطدم بالفهرس الفريد لمستند موجود أصلاً فشل شرطه فقط)
                await AgentDailyCounter.updateOne(
                    { agent: agent._id, day: dayKey },
                    { $setOnInsert: { agent: agent._id, day: dayKey, totalCoins: 0 } },
                    { upsert: true, session }
                );
                const counter = await AgentDailyCounter.findOneAndUpdate(
                    { agent: agent._id, day: dayKey, totalCoins: { $lte: settings.agentDailyCapCoins - coinsInt } },
                    { $inc: { totalCoins: coinsInt } },
                    { new: true, session }
                );
                if (!counter) {
                    throw Object.assign(new Error('تجاوزت الحد اليومي للتحويلات'), { code: 'DAILY_CAP_EXCEEDED' });
                }

                await walletService.post([
                    {
                        user: agentUserId, wallet: 'agent_inventory', delta: -coinsInt, type: 'agent_transfer',
                        refType: 'AgentTransfer', refId: idemBase, idempotencyKey: `${idemBase}:debit`
                    },
                    {
                        user: toUser._id, wallet: 'coins_paid', delta: coinsInt, type: 'agent_transfer',
                        refType: 'AgentTransfer', refId: idemBase, idempotencyKey: `${idemBase}:credit`
                    }
                ], session);

                const docs = await AgentTransfer.create([{
                    _id: idemBase, agent: agent._id, agentUser: agentUserId, toUser: toUser._id,
                    coins: coinsInt, clientRequestId
                }], { session });
                transferDoc = docs[0];

                await Agent.updateOne(
                    { _id: agent._id },
                    { $inc: { totalTransfers: 1, totalCoinsTransferred: coinsInt } },
                    { session }
                );
            });
        } catch (txError) {
            if (txError.code === 'DAILY_CAP_EXCEEDED') {
                return res.status(400).json({ status: 'fail', code: 'DAILY_CAP_EXCEEDED', message: `تجاوزت الحد اليومي للتحويلات (${settings.agentDailyCapCoins} كوينز)` });
            }
            if (txError.code === 11000) {
                // ✅ سباق حقيقي على نفس clientRequestId (طلبان متزامنان) — الفائز أنشأ السجل،
                // نعيد نتيجته للخاسر بدل خطأ غير مفيد له
                const race = await AgentTransfer.findOne({ agent: agent._id, clientRequestId });
                if (race) return res.status(200).json({ status: 'success', message: 'تم التحويل', data: { transfer: race } });
            }
            if (txError.code === 'INSUFFICIENT_FUNDS') {
                return res.status(400).json({ status: 'fail', message: 'مخزونك غير كافٍ لإتمام هذا التحويل' });
            }
            console.error('[ERROR] agent transfer transaction failed:', txError);
            return res.status(500).json({ status: 'fail', message: 'تعذّر إتمام التحويل' });
        } finally {
            await session.endSession();
        }

        const io = req.app.get('socketio');
        const agentUser = await User.findById(agentUserId).select('username');
        if (io && toUser.socketId) {
            io.to(toUser.socketId).emit('coinsReceived', { from: agentUser.username, coins: coinsInt });
        }
        await sendBotMessage(io, toUser._id, `💰 وصلتك ${coinsInt.toLocaleString('en-US')} كوينز من الوكيل ${agentUser.username}`);

        res.status(201).json({ status: 'success', message: 'تم التحويل بنجاح', data: { transfer: transferDoc } });
    } catch (error) {
        console.error('[ERROR] in agent transfer:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== مستخدم: التحويلات التي استلمتها من وكلاء (للتقييم/الإبلاغ) =====
exports.getMyReceivedTransfers = async (req, res) => {
    try {
        const transfers = await AgentTransfer.find({ toUser: req.user.id })
            .populate('agentUser', 'username profileImage customId').sort('-createdAt').limit(50);
        res.status(200).json({ status: 'success', data: { transfers } });
    } catch (error) {
        console.error('[ERROR] in getMyReceivedTransfers:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== مستخدم: تقييم تحويل استلمته (مرة واحدة) =====
exports.rateTransfer = async (req, res) => {
    try {
        const { transferId } = req.params;
        const { rating } = req.body;
        const ratingInt = Math.floor(Number(rating));
        if (!Number.isInteger(ratingInt) || ratingInt < 1 || ratingInt > 5) {
            return res.status(400).json({ status: 'fail', message: 'تقييم غير صالح (1-5)' });
        }

        const transfer = await AgentTransfer.findOneAndUpdate(
            { _id: transferId, toUser: req.user.id, rating: null },
            { $set: { rating: ratingInt, ratedAt: new Date() } },
            { new: true }
        );
        if (!transfer) {
            return res.status(400).json({ status: 'fail', message: 'لا يمكن تقييم هذا التحويل (غير موجود أو مُقيَّم مسبقاً)' });
        }

        await Agent.updateOne({ _id: transfer.agent }, { $inc: { ratingSum: ratingInt, ratingCount: 1 } });
        res.status(200).json({ status: 'success', message: 'تم إرسال تقييمك' });
    } catch (error) {
        console.error('[ERROR] in rateTransfer:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ===== مستخدم: إبلاغ عن تحويل خلال 24 ساعة =====
exports.reportTransfer = async (req, res) => {
    try {
        const { transferId } = req.params;
        const reason = String(req.body.reason || '').trim();
        if (!reason || reason.length < 3 || reason.length > 300) {
            return res.status(400).json({ status: 'fail', message: 'يرجى كتابة سبب الإبلاغ (3-300 حرف)' });
        }

        const transfer = await AgentTransfer.findOne({ _id: transferId, toUser: req.user.id });
        if (!transfer) return res.status(404).json({ status: 'fail', message: 'التحويل غير موجود' });
        if (transfer.createdAt < new Date(Date.now() - 24 * 3600000)) {
            return res.status(400).json({ status: 'fail', message: 'انتهت مهلة الإبلاغ (24 ساعة من التحويل)' });
        }
        if (transfer.report?.status !== 'none') {
            return res.status(400).json({ status: 'fail', message: 'تم الإبلاغ عن هذا التحويل مسبقاً' });
        }

        await AgentTransfer.updateOne(
            { _id: transferId, 'report.status': 'none' },
            { $set: { 'report.reportedAt': new Date(), 'report.reason': reason, 'report.status': 'open' } }
        );
        res.status(200).json({ status: 'success', message: 'تم استلام بلاغك، سيراجعه فريق الدعم' });
    } catch (error) {
        console.error('[ERROR] in reportTransfer:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// =====================================================
// ===== لوحة التحكم =====
// =====================================================
const AdminLog = require('../models/AdminLog');

exports.adminListAgents = async (req, res) => {
    try {
        const agents = await Agent.find().populate('user', 'username profileImage customId isOnline walletAgentInventory').sort('-createdAt');
        const settings = await SystemSettings.getSettings();
        const enriched = await Promise.all(agents.map(async (a) => {
            const tier = await computeAgentTier(a._id, a.tierOverride);
            return { ...a.toObject(), tier, ratePerUsd: rateForTier(tier, settings) };
        }));
        res.status(200).json({ status: 'success', data: { agents: enriched } });
    } catch (error) {
        console.error('[ERROR] in adminListAgents:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminCreateAgent = async (req, res) => {
    try {
        const { userId, customId, displayName } = req.body;
        const user = userId
            ? await User.findById(userId).select('username isAgent')
            : await User.findOne({ customId: String(customId || '').trim() }).select('username isAgent');
        if (!user) return res.status(404).json({ status: 'fail', message: 'المستخدم غير موجود' });

        const existing = await Agent.findOne({ user: user._id });
        if (existing) return res.status(400).json({ status: 'fail', message: 'هذا المستخدم وكيل مسبقاً' });

        const name = String(displayName || user.username).trim().slice(0, 40);
        const agent = await Agent.create({ user: user._id, displayName: name, createdBy: req.admin._id });
        // ✅ يبقي شارة "✓ معتمد" الحالية (isAgent) عاملة بكل نقاط عرضها الثمانية+ بلا أي تعديل هناك
        await User.updateOne({ _id: user._id }, { $set: { isAgent: true } });

        await AdminLog.logAction({
            admin: req.admin._id, action: 'create_agent', targetUser: user._id, targetEntity: 'user',
            entityId: agent._id, details: { displayName: name }, severity: 'info', ipAddress: req.ip
        });
        res.status(201).json({ status: 'success', message: 'تم تعيين الوكيل', data: { agent } });
    } catch (error) {
        console.error('[ERROR] in adminCreateAgent:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminSetAgentStatus = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { status } = req.body; // 'active' | 'suspended'
        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ status: 'fail', message: 'حالة غير صالحة' });
        }
        const agent = await Agent.findByIdAndUpdate(agentId, { $set: { status } }, { new: true });
        if (!agent) return res.status(404).json({ status: 'fail', message: 'الوكيل غير موجود' });

        await AdminLog.logAction({
            admin: req.admin._id, action: status === 'active' ? 'activate_agent' : 'suspend_agent',
            targetUser: agent.user, targetEntity: 'user', entityId: agent._id,
            details: {}, severity: 'warning', ipAddress: req.ip
        });
        res.status(200).json({ status: 'success', message: 'تم تحديث حالة الوكيل', data: { agent } });
    } catch (error) {
        console.error('[ERROR] in adminSetAgentStatus:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminSetTierOverride = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { tier } = req.body; // null | 'bronze' | 'silver' | 'gold'
        if (tier !== null && !['bronze', 'silver', 'gold'].includes(tier)) {
            return res.status(400).json({ status: 'fail', message: 'فئة غير صالحة' });
        }
        const agent = await Agent.findByIdAndUpdate(agentId, { $set: { tierOverride: tier } }, { new: true });
        if (!agent) return res.status(404).json({ status: 'fail', message: 'الوكيل غير موجود' });

        await AdminLog.logAction({
            admin: req.admin._id, action: 'set_agent_tier_override', targetUser: agent.user,
            targetEntity: 'user', entityId: agent._id, details: { tier }, severity: 'info', ipAddress: req.ip
        });
        res.status(200).json({ status: 'success', message: 'تم تحديث الفئة', data: { agent } });
    } catch (error) {
        console.error('[ERROR] in adminSetTierOverride:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

// ✅ إضافة مخزون لوكيل — معاملة ذرّية واحدة: سجل AgentPurchase + قيد ائتمان agent_inventory
exports.adminTopupInventory = async (req, res) => {
    try {
        const { agentId } = req.params;
        const { usd, txnNo, note } = req.body;

        const usdNum = Number(usd);
        if (!Number.isFinite(usdNum) || usdNum <= 0) {
            return res.status(400).json({ status: 'fail', message: 'مبلغ غير صالح' });
        }
        const txnDigits = String(txnNo || '').replace(/\D/g, '');
        if (txnDigits.length < 4 || txnDigits.length > 30) {
            return res.status(400).json({ status: 'fail', message: 'رقم عملية الدفع غير صالح' });
        }

        const agent = await Agent.findById(agentId);
        if (!agent) return res.status(404).json({ status: 'fail', message: 'الوكيل غير موجود' });

        const settings = await SystemSettings.getSettings();
        const tier = await computeAgentTier(agent._id, agent.tierOverride);
        const rate = rateForTier(tier, settings);
        const coins = Math.round(usdNum * rate);

        const idemBase = new mongoose.Types.ObjectId();
        const session = await mongoose.startSession();
        let purchase = null;
        try {
            await session.withTransaction(async () => {
                const docs = await AgentPurchase.create([{
                    _id: idemBase, agent: agent._id, usd: usdNum, tierAtPurchase: tier, rateAtPurchase: rate,
                    coins, txnNo: txnDigits, note: String(note || '').slice(0, 200), createdBy: req.admin._id
                }], { session });
                purchase = docs[0];

                await walletService.post([{
                    user: agent.user, wallet: 'agent_inventory', delta: coins, type: 'agent_inventory_topup',
                    refType: 'AgentPurchase', refId: idemBase, idempotencyKey: `${idemBase}:topup`
                }], session);
            });
        } catch (txError) {
            if (txError.code === 11000) {
                return res.status(409).json({ status: 'fail', message: 'رقم عملية الدفع هذا مُستخدَم من قبل' });
            }
            console.error('[ERROR] agent topup transaction failed:', txError);
            return res.status(500).json({ status: 'fail', message: 'تعذّر إتمام الشحن' });
        } finally {
            await session.endSession();
        }

        await AdminLog.logAction({
            admin: req.admin._id, action: 'agent_inventory_topup', targetUser: agent.user, targetEntity: 'user',
            entityId: purchase._id, details: { usd: usdNum, coins, txnNo: txnDigits }, severity: 'info', ipAddress: req.ip
        });
        res.status(201).json({ status: 'success', message: 'تم شحن المخزون بنجاح', data: { purchase } });
    } catch (error) {
        console.error('[ERROR] in adminTopupInventory:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminListPurchases = async (req, res) => {
    try {
        const { agentId } = req.params;
        const purchases = await AgentPurchase.find({ agent: agentId }).sort('-createdAt').limit(200);
        res.status(200).json({ status: 'success', data: { purchases } });
    } catch (error) {
        console.error('[ERROR] in adminListPurchases:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminListTransfers = async (req, res) => {
    try {
        const { agentId } = req.query;
        const query = {};
        if (agentId) query.agent = agentId;
        const transfers = await AgentTransfer.find(query)
            .populate('agentUser', 'username customId').populate('toUser', 'username customId')
            .sort('-createdAt').limit(300);
        res.status(200).json({ status: 'success', data: { transfers } });
    } catch (error) {
        console.error('[ERROR] in adminListTransfers:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminListReports = async (req, res) => {
    try {
        const { status = 'open' } = req.query;
        const query = status === 'all' ? {} : { 'report.status': status };
        const reports = await AgentTransfer.find(query)
            .populate('agentUser', 'username customId').populate('toUser', 'username customId')
            .sort('-report.reportedAt').limit(200);
        res.status(200).json({ status: 'success', data: { reports } });
    } catch (error) {
        console.error('[ERROR] in adminListReports:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminResolveReport = async (req, res) => {
    try {
        const { transferId } = req.params;
        const note = String(req.body.note || '').trim().slice(0, 300);

        const transfer = await AgentTransfer.findOneAndUpdate(
            { _id: transferId, 'report.status': 'open' },
            { $set: { 'report.status': 'resolved', 'report.resolvedBy': req.admin._id, 'report.resolvedAt': new Date(), 'report.resolutionNote': note } },
            { new: true }
        );
        if (!transfer) return res.status(400).json({ status: 'fail', message: 'لا يوجد بلاغ مفتوح لهذا التحويل' });

        await AdminLog.logAction({
            admin: req.admin._id, action: 'resolve_agent_report', targetUser: transfer.agentUser,
            targetEntity: 'user', entityId: transfer._id, details: { note }, severity: 'info', ipAddress: req.ip
        });
        res.status(200).json({ status: 'success', message: 'تم حل البلاغ', data: { transfer } });
    } catch (error) {
        console.error('[ERROR] in adminResolveReport:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

exports.adminGetAgentSummary = async (req, res) => {
    try {
        const { agentId } = req.params;
        const agent = await Agent.findById(agentId).populate('user', 'username profileImage customId walletAgentInventory');
        if (!agent) return res.status(404).json({ status: 'fail', message: 'الوكيل غير موجود' });

        const settings = await SystemSettings.getSettings();
        const tier = await computeAgentTier(agent._id, agent.tierOverride);
        const [purchases, transfers, openReports] = await Promise.all([
            AgentPurchase.find({ agent: agent._id }).sort('-createdAt').limit(20),
            AgentTransfer.find({ agent: agent._id }).populate('toUser', 'username customId').sort('-createdAt').limit(20),
            AgentTransfer.countDocuments({ agent: agent._id, 'report.status': 'open' })
        ]);

        res.status(200).json({
            status: 'success',
            data: {
                agent, tier, ratePerUsd: rateForTier(tier, settings),
                inventoryCoins: agent.user?.walletAgentInventory || 0,
                purchases, transfers, openReports
            }
        });
    } catch (error) {
        console.error('[ERROR] in adminGetAgentSummary:', error);
        res.status(500).json({ status: 'error', message: 'حدث خطأ في الخادم' });
    }
};

module.exports.getAgentForUser = getAgentForUser;
