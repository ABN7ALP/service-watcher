module.exports = {
    // Commission rates
    COMMISSION_RATE: 0.10, // 10% commission
    DEVELOPER_FEE: 0.20, // 0.20$ per dollar
    
    // Coin rates
    COINS_PER_USD: 100,
    GIFT_RETURN_RATE: 0.60, // 60% of gift value returned
    
    // Withdrawal fees
    WITHDRAWAL_FEE_PER_10_USD: 0.50,
    WITHDRAWAL_THRESHOLD: 10,
    
    // Limits
    MIN_DEPOSIT: 1,
    MAX_DEPOSIT: 1000,
    MIN_WITHDRAWAL: 1,
    MAX_WITHDRAWAL: 1000,
    
    // Voice recording limits
    MAX_VOICE_DURATION: 15, // seconds
    VOICE_VERIFICATION_DURATION: 7, // seconds
    
    // Chat limits
    MAX_MESSAGE_LENGTH: 500,
    CHAT_EXPIRY_HOURS: 12,
    
    // Battle settings
    BATTLE_TYPES: ['1v1', '2v2', '4v4'],
    BATTLE_TIMEOUT: 300, // 5 minutes in seconds
    READY_CHECK_TIME: 10, // seconds
    
    // User levels
    LEVEL_EXP_MULTIPLIER: 1.5,
    BASE_EXP: 100,
    
    // Gender verification
    GENDER_VERIFICATION_REQUIRED: true,
    
    // Admin permissions
    ADMIN_PERMISSIONS: [
        'ban',
        'mute',
        'kick',
        'lock_seat',
        'manage_users',
        'manage_withdrawals',
        'manage_deposits',
        'manage_gifts',
        'view_logs',
        'update_settings'
    ],
    
    // Notification types
    NOTIFICATION_TYPES: {
        BATTLE_INVITE: 'battle_invite',
        GIFT_RECEIVED: 'gift_received',
        DEPOSIT_APPROVED: 'deposit_approved',
        WITHDRAWAL_APPROVED: 'withdrawal_approved',
        VICTORY: 'victory',
        LEVEL_UP: 'level_up',
        ADMIN_ALERT: 'admin_alert'
    },
    
    // Cache TTLs (in seconds)
    CACHE_TTL: {
        USER_PROFILE: 300,
        BATTLE_LIST: 30,
        ONLINE_USERS: 10,
        GIFT_STORE: 600
    }
};
