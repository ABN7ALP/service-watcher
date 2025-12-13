// 📁 services/wheelService.js
class WheelService {
    constructor() {
        // الجوائز بالدولار - كما طلبت
        this.prizes = [0.1, 0.3, 0.5, 1, 2.5, 3, 5, 7, 9, 10];
        
        // الأوزان الأولية (الاحتمالات) - مجموعها = 1
        // هذه القيم تحدد ربحيتك! القيمة المتوقعة = ~0.82$
        this.weights = [0.25, 0.2, 0.15, 0.1, 0.08, 0.07, 0.06, 0.04, 0.03, 0.02];
        
        // يمكن تغيير الأوزان من لوحة الأدمن لاحقاً
        this.wheelConfig = {
            spinCost: 1.00, // سعر الدوران = 1 دولار
            minWithdrawal: 10.00, // الحد الأدنى للسحب
            lastUpdated: new Date()
        };
    }
    
    // 🎯 الخوارزمية الرئيسية - تحدد الجائزة بناءً على الاحتمالات
    spin() {
        let random = Math.random();
        let cumulativeWeight = 0;
        
        for (let i = 0; i < this.weights.length; i++) {
            cumulativeWeight += this.weights[i];
            
            if (random <= cumulativeWeight) {
                return {
                    prize: this.prizes[i],
                    index: i,
                    isWin: this.prizes[i] > 0 // ربح أي مبلغ
                };
            }
        }
        
        // حالة افتراضية (نادراً ما تحدث)
        return {
            prize: 0.1,
            index: 0,
            isWin: true
        };
    }
    
    // 📊 حساب القيمة المتوقعة (للتأكد من الربحية)
    calculateExpectedValue() {
        let expectedValue = 0;
        for (let i = 0; i < this.prizes.length; i++) {
            expectedValue += this.prizes[i] * this.weights[i];
        }
        return expectedValue.toFixed(2);
    }
    
    // 💰 حساب الربح المتوقع لكل 1000 دوران
    calculateExpectedProfit(spins = 1000) {
        const spinCost = this.wheelConfig.spinCost;
        const expectedValue = parseFloat(this.calculateExpectedValue());
        const profitPerSpin = spinCost - expectedValue;
        return (profitPerSpin * spins).toFixed(2);
    }
    
    // 🔧 تحديث الأوزان (من لوحة الأدمن)
    updateWeights(newWeights) {
        if (newWeights.length !== 10) {
            throw new Error('يجب أن يكون هناك 10 أوزان');
        }
        
        const sum = newWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 1) > 0.001) { // مجموعهم يجب أن يكون ≈ 1
            throw new Error('مجموع الأوزان يجب أن يساوي 1');
        }
        
        this.weights = newWeights;
        this.wheelConfig.lastUpdated = new Date();
        return { message: '✅ تم تحديث أوزان العجلة', expectedValue: this.calculateExpectedValue() };
    }
}

// تصدير نسخة واحدة من الخدمة (Singleton)
module.exports = new WheelService();
