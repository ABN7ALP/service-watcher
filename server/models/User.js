const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const generateCustomId = async () => {
    let isUnique = false;
    let customId;
    while (!isUnique) {
        customId = Math.floor(100000000 + Math.random() * 900000000).toString();
        const existingUser = await mongoose.models.User.findOne({ customId });
        if (!existingUser) isUnique = true;
    }
    return customId;
};

const userSchema = new mongoose.Schema({
    customId: { type: String, unique: true, required: true },
    gender: { type: String, enum: ['male', 'female'], required: true },
    birthDate: { type: Date, required: true },
    socialStatus: { type: String, enum: ['single', 'in_relationship', 'engaged', 'married', 'divorced', 'searching'], default: 'single' },
    educationStatus: { type: String, enum: ['studying', 'graduated', 'primary', 'high_school', 'university'], default: 'studying' },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },
    profileImage: { type: String, default: 'https://i.ibb.co/601T5nRV/7d580cf284dbd895ae2db4b598ec8bb2.jpg' },
    balance: { type: Number, default: 0 },
    coins: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    experience: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false },
    socketId: { type: String, default: null },

    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });


userSchema.pre('validate', async function(next) {
    if (this.isNew && !this.customId) {
        this.customId = await generateCustomId();
    }
    next();
});

userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 12);
    }
    next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

userSchema.virtual('age').get(function() {
    if (!this.birthDate) return null;
    const today = new Date();
    const birthDate = new Date(this.birthDate);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

const User = mongoose.model('User', userSchema);
module.exports = User;
