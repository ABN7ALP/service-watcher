/**
 * Spin Log Model Schema (for reference)
 *
 * {
 *   _id: ObjectId,
 *   userId: { type: ObjectId, ref: 'users' },
 *   cost: { type: Number },
 *   prizeValue: { type: Number },
 *   prizeType: { type: String },
 *   userBalanceBefore: { type: Number },
 *   userBalanceAfter: { type: Number },
 *   timestamp: { type: Date, default: Date.now }
 * }
 */
