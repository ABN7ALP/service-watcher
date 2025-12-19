const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { profileUpload } = require('../middleware/upload');

// Get user profile
router.get('/profile', auth, async (req, res) => {
    try {
        const user = req.user;
        
        // Get additional stats
        const Battle = require('../models/Battle');
        const Transaction = require('../models/Transaction');
        
        const [totalBattles, totalWins, recentTransactions] = await Promise.all([
            Battle.countDocuments({
                $or: [
                    { 'teamA.user': user._id },
                    { 'teamB.user': user._id }
                ],
                status: 'completed'
            }),
            Battle.countDocuments({
                $or: [
                    { winner: 'teamA', 'teamA.user': user._id },
                    { winner: 'teamB', 'teamB.user': user._id }
                ],
                status: 'completed'
            }),
            Transaction.find({ user: user._id })
                .sort('-createdAt')
                .limit(10)
        ]);
        
        res.json({
            success: true,
            user: {
                ...user.toObject(),
                stats: {
                    totalBattles,
                    totalWins,
                    winRate: totalBattles > 0 ? (totalWins / totalBattles * 100).toFixed(1) : 0
                },
                recentTransactions
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const updates = req.body;
        
        // Remove restricted fields
        delete updates.balance;
        delete updates.coins;
        delete updates.isAdmin;
        delete updates.isBanned;
        
        const User = require('../models/User');
        const user = await User.findByIdAndUpdate(
            userId,
            updates,
            { new: true, runValidators: true }
        ).select('-password');
        
        res.json({
            success: true,
            message: 'تم تحديث الملف الشخصي',
            user
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Upload profile picture
router.post('/profile/picture', auth, profileUpload, async (req, res) => {
    try {
        const { userId } = req.user;
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'صورة الملف الشخصي مطلوبة'
            });
        }
        
        // Upload to Cloudinary
        const cloudinary = require('cloudinary').v2;
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: 'profiles',
            transformation: [
                { width: 500, height: 500, crop: 'fill' },
                { quality: 'auto:good' }
            ]
        });
        
        // Update user profile
        const User = require('../models/User');
        const user = await User.findByIdAndUpdate(
            userId,
            { profileImage: result.secure_url },
            { new: true }
        ).select('-password');
        
        // Delete local file
        const fs = require('fs');
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            message: 'تم تحديث صورة الملف الشخصي',
            profileImage: result.secure_url
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Change password
router.post('/change-password', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { currentPassword, newPassword } = req.body;
        
        const User = require('../models/User');
        const user = await User.findById(userId).select('+password');
        
        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الحالية غير صحيحة'
            });
        }
        
        // Check password strength
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'كلمة المرور الجديدة يجب أن تكون على الأقل 6 أحرف'
            });
        }
        
        // Update password
        user.password = newPassword;
        await user.save();
        
        res.json({
            success: true,
            message: 'تم تغيير كلمة المرور بنجاح'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get user notifications
router.get('/notifications', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 20, unreadOnly = false } = req.query;
        
        // In a real app, you would have a Notification model
        // For now, we'll return mock data
        const notifications = [
            {
                _id: '1',
                type: 'system',
                title: 'مرحباً بك في المنصة!',
                message: 'نتمنى لك تجربة ممتعة معنا',
                read: true,
                createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
            },
            {
                _id: '2',
                type: 'battle',
                title: 'تحدي جديد',
                message: 'تم إنشاء تحدٍ 1 ضد 1 برهان 10$',
                read: false,
                createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000)
            },
            {
                _id: '3',
                type: 'gift',
                title: 'هدية جديدة!',
                message: 'لقد تلقيت هدية من مستخدم آخر',
                read: false,
                createdAt: new Date(Date.now() - 30 * 60 * 1000)
            }
        ];
        
        // Filter unread if requested
        let filteredNotifications = notifications;
        if (unreadOnly === 'true') {
            filteredNotifications = notifications.filter(n => !n.read);
        }
        
        // Paginate
        const start = (page - 1) * limit;
        const end = start + limit;
        const paginatedNotifications = filteredNotifications.slice(start, end);
        
        res.json({
            success: true,
            notifications: paginatedNotifications,
            total: filteredNotifications.length,
            totalPages: Math.ceil(filteredNotifications.length / limit),
            currentPage: page,
            unreadCount: notifications.filter(n => !n.read).length
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Mark notification as read
router.post('/notifications/:id/read', auth, async (req, res) => {
    try {
        // In a real app, you would update the notification in database
        // For now, we'll just return success
        
        res.json({
            success: true,
            message: 'تم تمييز الإشعار كمقروء'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get user friends/contacts
router.get('/friends', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { page = 1, limit = 50, onlineOnly = false } = req.query;
        
        // In a real app, you would have a Friend model
        // For now, we'll return mock data
        const User = require('../models/User');
        
        const query = { _id: { $ne: userId } };
        if (onlineOnly === 'true') {
            query.isOnline = true;
        }
        
        const friends = await User.find(query)
            .select('username profileImage isOnline lastActive level')
            .sort('-isOnline -lastActive')
            .limit(limit * 1)
            .skip((page - 1) * limit);
            
        const total = await User.countDocuments(query);
        
        res.json({
            success: true,
            friends,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Search users
router.get('/search', auth, async (req, res) => {
    try {
        const { q, page = 1, limit = 20 } = req.query;
        
        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'يرجى إدخال كلمة بحث مكونة من حرفين على الأقل'
            });
        }
        
        const User = require('../models/User');
        
        const users = await User.find({
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ],
            _id: { $ne: req.user.userId }
        })
        .select('username profileImage isOnline level')
        .limit(limit * 1)
        .skip((page - 1) * limit);
        
        const total = await User.countDocuments({
            $or: [
                { username: { $regex: q, $options: 'i' } },
                { email: { $regex: q, $options: 'i' } }
            ],
            _id: { $ne: req.user.userId }
        });
        
        res.json({
            success: true,
            users,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Report user
router.post('/report', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { targetUserId, reason, details, chatLog } = req.body;
        
        if (!targetUserId || !reason) {
            return res.status(400).json({
                success: false,
                message: 'يرجى تقديم جميع المعلومات المطلوبة'
            });
        }
        
        // Create report
        const Report = require('../models/Report');
        const report = new Report({
            reporter: userId,
            reportedUser: targetUserId,
            reason,
            details,
            chatLog,
            status: 'pending'
        });
        
        await report.save();
        
        // Notify admins (in real app, this would be via sockets or notifications)
        
        res.json({
            success: true,
            message: 'تم تقديم البلاغ بنجاح. سيتم مراجعته من قبل الإدارة',
            reportId: report._id
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get user leaderboard
router.get('/leaderboard', auth, async (req, res) => {
    try {
        const { type = 'deposits', limit = 10 } = req.query;
        
        const User = require('../models/User');
        let sortField;
        let displayField;
        
        switch (type) {
            case 'deposits':
                sortField = 'totalDeposited';
                displayField = 'إجمالي الشحن';
                break;
            case 'wins':
                sortField = 'totalWon';
                displayField = 'إجمالي الربح';
                break;
            case 'gifts':
                sortField = 'totalGifted';
                displayField = 'إجمالي الهدايا';
                break;
            case 'level':
                sortField = 'level';
                displayField = 'المستوى';
                break;
            default:
                sortField = 'totalDeposited';
                displayField = 'إجمالي الشحن';
        }
        
        const leaders = await User.find({ [sortField]: { $gt: 0 } })
            .sort({ [sortField]: -1 })
            .limit(parseInt(limit))
            .select(`username profileImage level ${sortField}`);
        
        // Check user's rank
        const userRank = await User.countDocuments({
            [sortField]: { $gt: req.user[sortField] || 0 }
        }) + 1;
        
        res.json({
            success: true,
            leaders: leaders.map((user, index) => ({
                rank: index + 1,
                username: user.username,
                profileImage: user.profileImage,
                level: user.level,
                value: user[sortField],
                isCurrentUser: user._id.toString() === req.user.userId
            })),
            currentUser: {
                rank: userRank,
                value: req.user[sortField] || 0
            },
            type,
            displayField
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Delete account request
router.post('/delete-account', auth, async (req, res) => {
    try {
        const { userId } = req.user;
        const { reason } = req.body;
        
        // In production, you would:
        // 1. Mark account for deletion
        // 2. Send confirmation email
        // 3. Schedule actual deletion after X days
        // 4. Allow cancellation during grace period
        
        // For now, we'll just return success
        res.json({
            success: true,
            message: 'تم تقديم طلب حذف الحساب. سيتواصل معك فريق الدعم قريباً'
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
