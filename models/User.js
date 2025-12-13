/**
 * User Model Schema (for reference)
 * This is not a functional file but a design document.
 *
 * {
 *   _id: ObjectId,
 *   username: { type: String, required: true, unique: true, lowercase: true },
 *   password: { type: String, required: true },
 *   balance: {
 *     available: { type: Number, default: 0 },
 *     pending: { type: Number, default: 0 }
 *   },
 *   stats: {
 *     totalSpins: { type: Number, default: 0 },
 *     totalWon: { type: Number, default: 0 },
 *     totalDeposited: { type: Number, default: 0 }
 *   },
 *   lastSpinAt: { type: Date, default: null },
 *   createdAt: { type: Date, default: Date.now }
 * }
 */
