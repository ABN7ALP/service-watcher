const mongoose = require('mongoose');

const giftSchema = new mongoose.Schema({
  // ✅ علم استئناف تضخيم ×10 لهذا المستند — يمنع تضخيم أي سعر مرتين عند إعادة تشغيل الترحيل
  redenominatedV1: { type: Boolean, default: false },
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
  // ✅ feat/gift-fx: فيديو مؤثر الهدية (يُعرض فوق الغرفة بـmix-blend-mode:screen ثم تطير
  // الهدية للمستلم) — منفصل عمداً عن animationUrl أعلاه (ذاك يُحمَّل مسبقاً لكل الهدايا
  // الأسطورية حالياً فور دخول الغرفة؛ videoUrl هنا يُطلَب فقط عند أول إرسال فعلي للهدية —
  // راجع "لا تحميل مسبق أبداً" بمواصفات استوديو المؤثرات docs/design/fx-studio-prototype.html)
  videoUrl: {
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
  },
  // 🛡️ feat/fanclub-v2-ui: هدية "النادي" الحصرية (مستوى معجب 13+) — لا تظهر بمتجر الهدايا
  // العام (isActive:false لها هناك) ولا تُرسَل إلا عبر فحص fanClubController.
  // assertFanClubExclusiveGiftEligible على كل مسار إرسال (راجع التعليق هناك)
  isFanClubExclusive: {
    type: Boolean,
    default: false
  },
  // 🛡️ fix/gift-stage-top-layer (بند 2-د): "تأثير المقعد" — علم أدمن لكل هدية (ابدأ بـ"تاج")
  // يضع تراكباً بصرياً (إيموجي الطبقة نفسها) على صورة مقعد المستلم لمدة ثابتة (~10 ثوانٍ، راجع
  // الراسم بـapp.js) — معادل الصوت لتأثيرات وجه TikTok، null يعني بلا تأثير مقعد لهذي الهدية
  seatEffect: {
    type: String,
    default: null
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
