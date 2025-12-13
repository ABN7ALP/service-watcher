 /**
 * Transaction Model Schema (for reference)
 *
 * {
 *   _id: ObjectId,
 *   userId: { type: ObjectId, ref: 'users' },
 *   username: { type: String }, // لتسهيل المراجعة في لوحة التحكم
 *   type: { type: String, enum: ['deposit', 'withdraw'] }, // نوع العملية
 *   amount: { type: Number },
 *   method: { type: String, default: 'Sham Cash' }, // طريقة الدفع
 *   status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
 *   
 *   // بيانات خاصة بالإيداع
 *   transactionId: { type: String, sparse: true }, // معرّف عملية شام كاش
 *   
 *   // بيانات خاصة بالسحب
 *   withdrawInfo: { type: String, sparse: true }, // معلومات التحويل للمستخدم
 *   
 *   createdAt: { type: Date, default: Date.now },
 *   processedAt: { type: Date, default: null } // تاريخ معالجة الطلب
 * }
 */
