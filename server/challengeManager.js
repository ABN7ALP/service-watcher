// المكان: server/challengeManager.js (ملف جديد)

const { v4: uuidv4 } = require('uuid');
const User = require('./models/User');

// سنستخدم Map بسيط في الذاكرة لإدارة التحديات النشطة
// في بيئة الإنتاج الحقيقية، يجب استبدال هذا بـ Redis لضمان الموثوقية وقابلية التوسع
const activeChallenges = new Map();

const CHALLENGE_TYPES = {
    '1v1_1': { type: '1v1', betAmount: 1, requiredPlayers: 2 },
    '1v1_5': { type: '1v1', betAmount: 5, requiredPlayers: 2 },
    '1v1_10': { type: '1v1', betAmount: 10, requiredPlayers: 2 },
    '2v2_10': { type: '2v2', betAmount: 10, requiredPlayers: 4 },
};

const DEV_COMMISSION = 0.10; // 10%

function initializeChallengeManager(io) {

    // دالة لإرسال قائمة التحديات المحدثة إلى جميع المستخدمين
    function broadcastChallenges() {
        const challengesList = Array.from(activeChallenges.values()).map(c => ({
            id: c.id,
            type: c.type,
            betAmount: c.betAmount,
            players: c.players.map(p => ({ username: p.username })),
            requiredPlayers: c.requiredPlayers
        }));
        io.emit('challengesUpdate', challengesList);
    }

    // دالة لمعالجة التحدي عند اكتماله
    async function processChallenge(challengeId) {
        const challenge = activeChallenges.get(challengeId);
        if (!challenge) return;

        console.log(`Processing challenge: ${challengeId}`);

        // هنا منطق تحديد الفائز. حالياً، سنختار فائزاً عشوائياً
        const winnerIndex = Math.floor(Math.random() * challenge.players.length);
        const winner = challenge.players[winnerIndex];

        const totalPot = challenge.betAmount * challenge.requiredPlayers;
        const prize = totalPot * (1 - DEV_COMMISSION);

        try {
            const winnerUser = await User.findById(winner.id);
            winnerUser.balance += prize;
            await winnerUser.save();

            // إرسال نتيجة التحدي للاعبين المشاركين فقط
            const resultPayload = {
                winner: { username: winner.username },
                prize: prize
            };
            challenge.players.forEach(player => {
                io.to(player.socketId).emit('challengeResult', resultPayload);
            });

        } catch (error) {
            console.error("Error processing challenge:", error);
            // يجب إضافة منطق لإعادة الأموال للاعبين في حالة حدوث خطأ
        }

        activeChallenges.delete(challengeId);
        broadcastChallenges();
    }

    // الاستماع لاتصالات Socket.io الجديدة
    io.on('connection', (socket) => {
        // إرسال قائمة التحديات الحالية للمستخدم الجديد فوراً
        socket.emit('initialChallenges', Array.from(activeChallenges.values()).map(c => ({
            id: c.id,
            type: c.type,
            betAmount: c.betAmount,
            players: c.players.map(p => ({ username: p.username })),
            requiredPlayers: c.requiredPlayers
        })));

        // الاستماع لحدث إنشاء تحدي جديد
        socket.on('createChallenge', async ({ challengeTypeKey }) => {
            const user = socket.user; // المستخدم المرفق من middleware المصادقة
            const challengeConfig = CHALLENGE_TYPES[challengeTypeKey];

            if (!challengeConfig) return socket.emit('error', { message: 'نوع التحدي غير صالح.' });
            if (user.balance < challengeConfig.betAmount) return socket.emit('error', { message: 'رصيدك غير كافٍ.' });

            user.balance -= challengeConfig.betAmount;
            await user.save();

            const newChallenge = {
                id: uuidv4(),
                type: challengeConfig.type,
                betAmount: challengeConfig.betAmount,
                requiredPlayers: challengeConfig.requiredPlayers,
                players: [{ id: user.id, username: user.username, socketId: socket.id }],
                createdAt: new Date()
            };

            activeChallenges.set(newChallenge.id, newChallenge);
            socket.join(newChallenge.id); // انضمام اللاعب إلى "غرفة" التحدي
            broadcastChallenges();
            socket.emit('balanceUpdate', { newBalance: user.balance });
        });

        // الاستماع لحدث الانضمام إلى تحدي
        socket.on('joinChallenge', async ({ challengeId }) => {
            const user = socket.user;
            const challenge = activeChallenges.get(challengeId);

            if (!challenge) return socket.emit('error', { message: 'التحدي لم يعد متاحاً.' });
            if (user.balance < challenge.betAmount) return socket.emit('error', { message: 'رصيدك غير كافٍ.' });
            if (challenge.players.length >= challenge.requiredPlayers) return socket.emit('error', { message: 'هذا التحدي مكتمل.' });
            if (challenge.players.some(p => p.id === user.id)) return socket.emit('error', { message: 'أنت منضم بالفعل لهذا التحدي.' });

            user.balance -= challenge.betAmount;
            await user.save();

            challenge.players.push({ id: user.id, username: user.username, socketId: socket.id });
            socket.join(challenge.id);
            
            if (challenge.players.length === challenge.requiredPlayers) {
                io.to(challenge.id).emit('challengeStarting');
                setTimeout(() => processChallenge(challenge.id), 3000); // ابدأ المعالجة بعد 3 ثوانٍ
            }

            broadcastChallenges();
            socket.emit('balanceUpdate', { newBalance: user.balance });
        });
    });
}

module.exports = initializeChallengeManager;
