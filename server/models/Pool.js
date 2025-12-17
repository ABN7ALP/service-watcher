// المكان: server/models/Pool.js

const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema({
    // سنستخدم معرفاً ثابتاً ليكون لدينا سجل واحد فقط للحوض
    identifier: {
        type: String,
        default: 'main_jackpot_pool',
        unique: true
    },
    balance: {
        type: Number,
        default: 10 // يمكن أن نبدأ الحوض بمبلغ صغير كهدية من الموقع
    },
    totalCollected: { // إجمالي ما تم جمعه
        type: Number,
        default: 0
    },
    totalPaidOut: { // إجمالي ما تم دفعه كجوائز
        type: Number,
        default: 0
    }
});

// دالة لإضافة الأموال إلى الحوض
poolSchema.statics.addToPool = async function(amount) {
    return this.findOneAndUpdate(
        { identifier: 'main_jackpot_pool' },
        { $inc: { balance: amount, totalCollected: amount } },
        { new: true, upsert: true } // upsert: أنشئ السجل إذا لم يكن موجوداً
    );
};

// دالة لسحب الأموال من الحوض (عندما يفوز لاعب)
poolSchema.statics.subtractFromPool = async function(amount) {
    return this.findOneAndUpdate(
        { identifier: 'main_jackpot_pool' },
        { $inc: { balance: -amount, totalPaidOut: amount } },
        { new: true }
    );
};

module.exports = mongoose.model('Pool', poolSchema);
