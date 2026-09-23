// ملف: server/models/FanClubMembership.js
//
// ✅ عضوية "نادي المعجبين" — صف واحد لكل (مالك النادي، عضو) — createdAt يمثّل وقت الانضمام.
// فهرس فريد مركّب يمنع الانضمام المكرر (ويحمي من سباق نقرتين متزامنتين تخصمان الكوينز مرتين)
const mongoose = require('mongoose');

const fanClubMembershipSchema = new mongoose.Schema({
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }
}, { timestamps: true });

fanClubMembershipSchema.index({ owner: 1, member: 1 }, { unique: true });
fanClubMembershipSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('FanClubMembership', fanClubMembershipSchema);
