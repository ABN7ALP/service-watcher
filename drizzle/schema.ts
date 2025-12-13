import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * جدول المستخدمين الأساسي مع حقول إضافية للأمان
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  
  // حقول الأمان والتتبع
  lastIp: varchar("lastIp", { length: 45 }),
  lastDevice: text("lastDevice"),
  
  // حدود الربح اليومية (بالدولار)
  dailyWinLimit: int("dailyWinLimit").default(100).notNull(),
  
  // حالة الحساب
  isBlocked: boolean("isBlocked").default(false).notNull(),
  blockReason: text("blockReason"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * نظام المحفظة الثنائي (Available/Pending)
 */
export const wallets = mysqlTable("wallets", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // الرصيد المتاح للاستخدام (بالسنت - cents)
  availableBalance: int("availableBalance").default(0).notNull(),
  
  // الرصيد المعلق (في انتظار الموافقة)
  pendingBalance: int("pendingBalance").default(0).notNull(),
  
  // عدد اللفات المتاحة
  availableSpins: int("availableSpins").default(0).notNull(),
  
  // إجمالي الأرباح (للإحصائيات)
  totalWinnings: int("totalWinnings").default(0).notNull(),
  
  // إجمالي الخسائر
  totalLosses: int("totalLosses").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * طلبات الشحن (Deposits)
 */
export const deposits = mysqlTable("deposits", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // المبلغ المطلوب (بالسنت)
  amount: int("amount").notNull(),
  
  // نوع الباقة (single, pack_10, pack_50, pack_100)
  packageType: varchar("packageType", { length: 20 }).notNull(),
  
  // عدد اللفات المطلوبة
  spinsCount: int("spinsCount").notNull(),
  
  // رابط الإيصال المرفوع على S3
  receiptUrl: text("receiptUrl").notNull(),
  
  // حالة الطلب
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  
  // ملاحظات الإدارة
  adminNotes: text("adminNotes"),
  
  // من قام بالموافقة/الرفض
  reviewedBy: int("reviewedBy"),
  reviewedAt: timestamp("reviewedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * طلبات السحب (Withdrawals)
 */
export const withdrawals = mysqlTable("withdrawals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // المبلغ المطلوب سحبه (بالسنت)
  amount: int("amount").notNull(),
  
  // معلومات الحساب للتحويل
  shamCashAccount: varchar("shamCashAccount", { length: 100 }).notNull(),
  shamCashName: varchar("shamCashName", { length: 100 }).notNull(),
  
  // حالة الطلب
  status: mysqlEnum("status", ["pending", "processing", "completed", "rejected"]).default("pending").notNull(),
  
  // ملاحظات الإدارة
  adminNotes: text("adminNotes"),
  
  // رقم التحويل (بعد الإتمام)
  transferReference: varchar("transferReference", { length: 100 }),
  
  // من قام بالمعالجة
  processedBy: int("processedBy"),
  processedAt: timestamp("processedAt"),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * سجلات اللفات (Spins)
 */
export const spins = mysqlTable("spins", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // نتيجة اللفة
  result: mysqlEnum("result", ["loss", "near_win", "small_win", "medium_win", "big_win", "jackpot"]).notNull(),
  
  // المبلغ المربوح/المخسور (بالسنت)
  amount: int("amount").notNull(),
  
  // القطاع الذي توقفت عليه العجلة (0-5)
  segmentIndex: int("segmentIndex").notNull(),
  
  // الزاوية النهائية للعجلة
  finalRotation: int("finalRotation").notNull(),
  
  // توقيع HMAC للتحقق من صحة النتيجة
  signature: varchar("signature", { length: 128 }).notNull(),
  
  // معلومات الأمان
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  deviceInfo: text("deviceInfo"),
  
  // الرصيد قبل وبعد اللفة (للتدقيق)
  balanceBefore: int("balanceBefore").notNull(),
  balanceAfter: int("balanceAfter").notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * الإحصائيات اليومية
 */
export const dailyStats = mysqlTable("dailyStats", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 10 }).notNull().unique(), // YYYY-MM-DD
  
  // عدد اللاعبين النشطين
  activePlayers: int("activePlayers").default(0).notNull(),
  
  // إجمالي اللفات
  totalSpins: int("totalSpins").default(0).notNull(),
  
  // إجمالي الأرباح الموزعة (بالسنت)
  totalWinnings: int("totalWinnings").default(0).notNull(),
  
  // إجمالي الإيرادات (بالسنت)
  totalRevenue: int("totalRevenue").default(0).notNull(),
  
  // أكبر فوز اليوم (بالسنت)
  biggestWin: int("biggestWin").default(0).notNull(),
  biggestWinUser: varchar("biggestWinUser", { length: 100 }),
  
  // عدد الـ Jackpots
  jackpotCount: int("jackpotCount").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/**
 * سجلات نشاط المستخدمين (للأمان والمراقبة)
 */
export const activityLogs = mysqlTable("activityLogs", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  
  // نوع النشاط
  activityType: mysqlEnum("activityType", ["login", "spin", "deposit_request", "withdrawal_request", "suspicious"]).notNull(),
  
  // تفاصيل النشاط
  details: text("details"),
  
  // معلومات الأمان
  ipAddress: varchar("ipAddress", { length: 45 }).notNull(),
  deviceInfo: text("deviceInfo"),
  
  // علامة للنشاط المشبوه
  isSuspicious: boolean("isSuspicious").default(false).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

/**
 * إحصائيات المستخدم اليومية (لتطبيق حدود الربح)
 */
export const userDailyStats = mysqlTable("userDailyStats", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  
  // عدد اللفات اليوم
  spinsCount: int("spinsCount").default(0).notNull(),
  
  // إجمالي الأرباح اليوم (بالسنت)
  totalWinnings: int("totalWinnings").default(0).notNull(),
  
  // إجمالي الخسائر اليوم
  totalLosses: int("totalLosses").default(0).notNull(),
  
  // عدد الانتصارات المتتالية (للنظام التكيفي)
  consecutiveWins: int("consecutiveWins").default(0).notNull(),
  
  // عدد الخسائر المتتالية
  consecutiveLosses: int("consecutiveLosses").default(0).notNull(),
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Wallet = typeof wallets.$inferSelect;
export type InsertWallet = typeof wallets.$inferInsert;

export type Deposit = typeof deposits.$inferSelect;
export type InsertDeposit = typeof deposits.$inferInsert;

export type Withdrawal = typeof withdrawals.$inferSelect;
export type InsertWithdrawal = typeof withdrawals.$inferInsert;

export type Spin = typeof spins.$inferSelect;
export type InsertSpin = typeof spins.$inferInsert;

export type DailyStat = typeof dailyStats.$inferSelect;
export type InsertDailyStat = typeof dailyStats.$inferInsert;

export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = typeof activityLogs.$inferInsert;

export type UserDailyStat = typeof userDailyStats.$inferSelect;
export type InsertUserDailyStat = typeof userDailyStats.$inferInsert;
