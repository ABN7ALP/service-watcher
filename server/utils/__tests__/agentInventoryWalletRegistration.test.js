// 🛡️ feat/agents-v1 — agent_inventory يجب أن تكون محفظة دفتر أستاذ مسجَّلة بالكامل: walletService
// (المصدر الوحيد لـWALLETS بمهمة المطابقة الليلية — raja walletReconciliationJob.js) وLedgerEntry
// (enum) معاً، وإلا لن تُطابَق تلقائياً ولن تُقبَل أي قيد عليها
const { WALLET_TO_USER_FIELD } = require('../walletService');
const { LEDGER_WALLETS } = require('../../models/LedgerEntry');

test('agent_inventory مسجَّلة بـWALLET_TO_USER_FIELD (تُدرَج تلقائياً بمطابقة walletReconciliationJob)', () => {
    expect(WALLET_TO_USER_FIELD.agent_inventory).toBe('walletAgentInventory');
});

test('agent_inventory ضمن LEDGER_WALLETS (وإلا يُرفَض أي قيد عليها بمخطط LedgerEntry)', () => {
    expect(LEDGER_WALLETS).toContain('agent_inventory');
});
