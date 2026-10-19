const mongoose = require('mongoose');

const giftSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: String,
  imageUrl: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 10 // Minimum 10 coins
  },
  category: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary', 'custom'],
    default: 'common'
  },
  animation: String,
  sound: String,
  // ✅ طلب صريح (هدايا v2): أصل ملء الشاشة الاختياري (فيديو/لوتي/صورة متحركة) للهدايا
  // الأسطورية — null لأي هدية بلا تأثير ملء شاشة مخصّص (الاحتفال الافتراضي يكفيها)
  animationUrl: {
    type: String,
    default: null
  },
  // ✅ طلب صريح: افتراضياً true للهدايا الأسطورية فقط (تأثير ملء الشاشة)، false لبقية
  // الفئات — دالة افتراضية (لا قيمة ثابتة) كي تعتمد على category وقت الإنشاء نفسه
  isFullscreen: {
    type: Boolean,
    default: function () {
      return this.category === 'legendary';
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  discountedPrice: Number,
  sortOrder: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Calculate discounted price before saving
giftSchema.pre('save', function(next) {
  if (this.discount > 0) {
    this.discountedPrice = this.price - (this.price * this.discount / 100);
  } else {
    this.discountedPrice = this.price;
  }
  next();
});

const Gift = mongoose.model('Gift', giftSchema);
module.exports = Gift;
