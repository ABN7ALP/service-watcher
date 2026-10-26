#!/usr/bin/env node
'use strict';

// ملف: scripts/walletMigrateDry.js
// 🛡️ مراجعة ما قبل الدمج (6 عوائق — PR #131، عائق #3): يشغّل معاينة ترحيل إعادة التسمية ×10
// (dryRun:true) ضد MONGODB_URI الحالي بالبيئة فعلياً — يطبع جدول الإجماليات قبل/بعد فقط،
// لا يكتب شيئاً إطلاقاً (لا ادّعاء JobRun حتى). مُخصَّص للتشغيل ضد نسخة (COPY) من قاعدة
// الإنتاج قبل الدمج، لا قاعدة الإنتاج الحقيقية مباشرة — راجع README/وصف PR
require('dotenv').config();
const mongoose = require('mongoose');

async function main() {
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI غير مُعرَّف بالبيئة');
        process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`✅ متصل بقاعدة البيانات — معاينة فقط (dry-run)، لا كتابة فعلية`);

    const { runMigration } = require('../server/utils/walletRedenominationMigration');
    const result = await runMigration({ dryRun: true });

    console.log(`\nانتهت المعاينة — usersProcessed=${result.usersProcessed}, allOk=${result.allOk}`);
    await mongoose.disconnect();
    process.exit(result.allOk ? 0 : 1);
}

main().catch(err => {
    console.error('❌ فشل تشغيل المعاينة:', err);
    process.exit(1);
});
