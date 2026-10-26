// ملف: noDirectCoinsWrite.test.js
// 🛡️ طلب صريح (feat/wallet-ledger-v1): "لا كتابة مباشرة متبقية لأي رصيد — walletService.post
// هي الطريقة الوحيدة المخوَّلة". هذا الاختبار يفحص كل كود السيرفر (عدا walletService.js نفسها
// والاختبارات) بحثاً عن $inc مباشر أو +=/-= على أي من: coins/balance القديمَين، أو أي حقل
// محفظة جديد (walletCoinsPaid/walletCoinsBonus/walletBeansW/walletBeansP/walletUsdCents) —
// ويفشل فوراً لو وجد أياً منها. لا منطق هنا، فقط بحث نصّي — إن أضاف أحدٌ مستقبلاً مساراً مالياً
// جديداً بتجاوز walletService، هذا الاختبار يُسقِطه قبل أي مراجعة بشرية

const fs = require('fs');
const path = require('path');

const SERVER_ROOT = path.join(__dirname, '..', '..');
const SCAN_DIRS = ['controllers', 'services', 'sockets', 'utils'];

// ✅ walletService.js نفسها هي المكان الوحيد المسموح فيه بهذا النمط (هي التنفيذ الحقيقي).
// migrations/redenomination (طلب صريح — بند ×10) ليست "مساراً مالياً حياً" بل سكربت ترقية
// بنية واحد لمرة واحدة، يُعمِّر الأرصدة القديمة إلى الجديدة مباشرة قبل أن تصبح walletService
// مصدر الحقيقة — تُستثنى بالاسم صريحاً لا بمسار عام فضفاض
const ALLOWED_BASENAMES = new Set(['walletService.js', 'walletRedenominationMigration.js']);

const WALLET_FIELDS = ['coins', 'balance', 'walletCoinsPaid', 'walletCoinsBonus', 'walletBeansW', 'walletBeansP', 'walletUsdCents'];
const FIELD_GROUP = WALLET_FIELDS.join('|');
const PATTERNS = [
    new RegExp(`\\$inc\\s*:\\s*\\{[^}]*\\b(${FIELD_GROUP})\\b`),
    new RegExp(`\\.(${FIELD_GROUP})\\s*[+-]=`)
];

function listJsFiles(dir) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
            results = results.concat(listJsFiles(full));
        } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
            results.push(full);
        }
    }
    return results;
}

describe('لا كتابة مباشرة لأي رصيد خارج walletService.js', () => {
    test('بحث نصّي شامل بكل كود السيرفر — أي تطابق يفشل الاختبار فوراً مع موقعه بالضبط', () => {
        const violations = [];
        for (const dir of SCAN_DIRS) {
            const dirPath = path.join(SERVER_ROOT, dir);
            if (!fs.existsSync(dirPath)) continue;
            for (const file of listJsFiles(dirPath)) {
                if (ALLOWED_BASENAMES.has(path.basename(file))) continue;
                const lines = fs.readFileSync(file, 'utf8').split('\n');
                lines.forEach((line, i) => {
                    const trimmed = line.trim();
                    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // ✅ تعليقات توضيحية فقط
                    for (const pattern of PATTERNS) {
                        if (pattern.test(line)) {
                            violations.push(`${path.relative(SERVER_ROOT, file)}:${i + 1}: ${trimmed}`);
                        }
                    }
                });
            }
        }
        expect(violations).toEqual([]);
    });
});
