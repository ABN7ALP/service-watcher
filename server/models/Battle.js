const mongoose = require('mongoose');

// استبدل السكيما الحالية بهذه
const battleSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['1v1', '2v2', '4v4'],
        required: [true, 'نوع التحدي مطلوب'],
    },
    betAmount: {
        type: Number,
        required: [true, 'مبلغ الرهان مطلوب'],
        min: 1,
    },
    status: {
        type: String,
        enum: ['waiting', 'in-progress', 'completed', 'cancelled'],
        default: 'waiting',
    },
    players: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }],
    teams: {
        teamA: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        teamB: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
    winner: {
        type: String,
        enum: ['teamA', 'teamB', 'draw'],
    },
    isPrivate: {
        type: Boolean,
        default: false,
    },
    password: {
        type: String,
    },
    // --- ✅ الحقول الجديدة للعبة ---
    gameType: {
        type: String,
        enum: ['fastest-clicker'], // حاليًا لدينا لعبة واحدة فقط
        default: 'fastest-clicker',
    },
    gameState: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: () => new Map() // ⚠️ هذا مهم!
}
    // --- نهاية الحقول الجديدة ---
}, { timestamps: true });


// دالة مساعدة لتحديد الحد الأقصى للاعبين
battleSchema.virtual('maxPlayers').get(function() {
    switch (this.type) {
        case '1v1': return 2;
        case '2v2': return 4;
        case '4v4': return 8;
        default: return 0;
    }
});

const Battle = mongoose.model('Battle', battleSchema);
module.exports = Battle;
