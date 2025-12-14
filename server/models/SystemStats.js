// المكان: server/models/SystemStats.js

const mongoose = require('mongoose');

const SystemStatsSchema = new mongoose.Schema({
    // نستخدم _id ثابت لضمان وجود وثيقة واحدة فقط
    _id: {
        type: String,
        default: 'main_stats'
    },
    totalSpins: {
        type: Number,
        default: 0
    },
    totalWins: {
        type: Number,
        default: 0
    }
});

module.exports = mongoose.model('SystemStats', SystemStatsSchema);
