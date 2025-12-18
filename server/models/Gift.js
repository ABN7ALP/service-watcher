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
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },
  animation: String,
  sound: String,
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
