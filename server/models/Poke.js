// ✅ سجل "نكزات" بسيط — حدث خام لكل نكزة، يُستخدم لحساب عدّاد "نكز اليوم" بمركز الملف الشخصي
const mongoose = require('mongoose');

const pokeSchema = new mongoose.Schema({
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

pokeSchema.index({ to: 1, createdAt: -1 });

module.exports = mongoose.model('Poke', pokeSchema);
