const mongoose = require('mongoose');

const profileFrameSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },

    cssClass: {
        type: String,
        required: true
    },

    previewImage: {
        type: String
    },

    isActive: {
        type: Boolean,
        default: true
    },

    sortOrder: {
        type: Number,
        default: 0
    },

    // أسعار مختلفة حسب المدة
    prices: {
        days7: {
            type: Number,
            required: true
        },

        days30: {
            type: Number,
            required: true
        },

        days365: {
            type: Number,
            required: true
        }
    }

}, {
    timestamps: true
});

module.exports = mongoose.model('ProfileFrame', profileFrameSchema);
