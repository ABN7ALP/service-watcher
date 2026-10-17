// ملف: jest.config.js
// ✅ اختبارات دوري PK الأسبوعي (LP/idempotency/مكافحة التلاعب/الرتب/إغلاق الموسم) تعتمد على
// محاكاة (mock) نماذج Mongoose مباشرة بدل قاعدة بيانات حقيقية أو mongodb-memory-server — بيئة
// التشغيل الحالية تحجب كل نطاقات mongodb.org/mongodb.com (سياسة شبكة الجلسة)، فتحميل ثنائي
// mongod يفشل دوماً هنا؛ المحاكاة بديل كامل الصحة لمنطق الأعمال المختبَر (الحساب/الفروع الذرّية)
// ولا يعتمد على اتصال قاعدة بيانات فعلي إطلاقاً
module.exports = {
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/'],
    testMatch: ['**/__tests__/**/*.test.js'],
    // ✅ normalize-frames.test.js يستدعي sharp .webp({effort:6}) الحقيقي (أقصى جهد ضغط
    // libwebp — طلب صريح بمراجعة PR لميزانية 400KB) عدة مرات متتالية؛ أبطأ محسوساً من effort:5
    // السابق على مصادر اختبار مكبَّرة (huge-source) — المهلة الافتراضية 5000ms تصبح ضيقة
    testTimeout: 20000
};
