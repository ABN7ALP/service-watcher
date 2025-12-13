import { eq, and, desc, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, users, 
  wallets, InsertWallet,
  deposits, InsertDeposit,
  withdrawals, InsertWithdrawal,
  spins, InsertSpin,
  dailyStats, InsertDailyStat,
  activityLogs, InsertActivityLog,
  userDailyStats, InsertUserDailyStat
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ============= User Management =============

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod", "lastIp", "lastDevice"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserBlockStatus(userId: number, isBlocked: boolean, reason?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(users)
    .set({ isBlocked, blockReason: reason || null })
    .where(eq(users.id, userId));
}

// ============= Wallet Management =============

export async function getOrCreateWallet(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  await db.insert(wallets).values({ userId });
  const newWallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1);
  return newWallet[0];
}

export async function updateWalletBalance(
  userId: number, 
  availableDelta: number, 
  pendingDelta: number = 0,
  spinsDelta: number = 0
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(wallets)
    .set({
      availableBalance: sql`${wallets.availableBalance} + ${availableDelta}`,
      pendingBalance: sql`${wallets.pendingBalance} + ${pendingDelta}`,
      availableSpins: sql`${wallets.availableSpins} + ${spinsDelta}`,
    })
    .where(eq(wallets.userId, userId));
}

// ============= Deposits Management =============

export async function createDeposit(deposit: InsertDeposit) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(deposits).values(deposit);
  return result;
}

export async function getPendingDeposits() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(deposits)
    .where(eq(deposits.status, "pending"))
    .orderBy(desc(deposits.createdAt));
}

export async function getDepositById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(deposits).where(eq(deposits.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateDepositStatus(
  id: number, 
  status: "approved" | "rejected", 
  reviewedBy: number,
  adminNotes?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(deposits)
    .set({ 
      status, 
      reviewedBy, 
      reviewedAt: new Date(),
      adminNotes: adminNotes || null
    })
    .where(eq(deposits.id, id));
}

// ============= Withdrawals Management =============

export async function createWithdrawal(withdrawal: InsertWithdrawal) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(withdrawals).values(withdrawal);
  return result;
}

export async function getPendingWithdrawals() {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(withdrawals)
    .where(eq(withdrawals.status, "pending"))
    .orderBy(desc(withdrawals.createdAt));
}

export async function getWithdrawalById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(withdrawals).where(eq(withdrawals.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateWithdrawalStatus(
  id: number,
  status: "processing" | "completed" | "rejected",
  processedBy: number,
  adminNotes?: string,
  transferReference?: string
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(withdrawals)
    .set({
      status,
      processedBy,
      processedAt: new Date(),
      adminNotes: adminNotes || null,
      transferReference: transferReference || null
    })
    .where(eq(withdrawals.id, id));
}

// ============= Spins Management =============

export async function createSpin(spin: InsertSpin) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(spins).values(spin);
  return result;
}

export async function getUserSpins(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(spins)
    .where(eq(spins.userId, userId))
    .orderBy(desc(spins.createdAt))
    .limit(limit);
}

export async function getRecentSpins(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(spins)
    .orderBy(desc(spins.createdAt))
    .limit(limit);
}

// ============= Daily Stats Management =============

export async function getOrCreateDailyStat(date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select().from(dailyStats).where(eq(dailyStats.date, date)).limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  await db.insert(dailyStats).values({ date });
  const newStat = await db.select().from(dailyStats).where(eq(dailyStats.date, date)).limit(1);
  return newStat[0];
}

export async function updateDailyStats(
  date: string,
  updates: Partial<InsertDailyStat>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(dailyStats)
    .set(updates)
    .where(eq(dailyStats.date, date));
}

export async function getDailyStats(date: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(dailyStats).where(eq(dailyStats.date, date)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ============= User Daily Stats Management =============

export async function getOrCreateUserDailyStat(userId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const existing = await db.select()
    .from(userDailyStats)
    .where(and(
      eq(userDailyStats.userId, userId),
      eq(userDailyStats.date, date)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    return existing[0];
  }
  
  await db.insert(userDailyStats).values({ userId, date });
  const newStat = await db.select()
    .from(userDailyStats)
    .where(and(
      eq(userDailyStats.userId, userId),
      eq(userDailyStats.date, date)
    ))
    .limit(1);
  return newStat[0];
}

export async function updateUserDailyStats(
  userId: number,
  date: string,
  updates: Partial<InsertUserDailyStat>
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.update(userDailyStats)
    .set(updates)
    .where(and(
      eq(userDailyStats.userId, userId),
      eq(userDailyStats.date, date)
    ));
}

// ============= Activity Logs =============

export async function createActivityLog(log: InsertActivityLog) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(activityLogs).values(log);
}

export async function getSuspiciousActivities(limit: number = 100) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(activityLogs)
    .where(eq(activityLogs.isSuspicious, true))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}

export async function getUserActivities(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(activityLogs)
    .where(eq(activityLogs.userId, userId))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);
}
