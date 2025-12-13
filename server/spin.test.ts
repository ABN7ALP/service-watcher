import { describe, expect, it, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(userId: number = 1): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "manus",
    role: "user",
    lastIp: "127.0.0.1",
    lastDevice: "test-device",
    dailyWinLimit: 10000,
    isBlocked: false,
    blockReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
      ip: "127.0.0.1"
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("Wallet System", () => {
  it("should create wallet for new user", async () => {
    const { ctx } = createTestContext(999);
    const caller = appRouter.createCaller(ctx);

    const wallet = await caller.wallet.get();

    expect(wallet).toBeDefined();
    expect(wallet.userId).toBe(999);
    expect(wallet.availableBalance).toBe(0);
    expect(wallet.pendingBalance).toBe(0);
    expect(wallet.availableSpins).toBe(0);
  });

  it("should return existing wallet", async () => {
    const { ctx } = createTestContext(999);
    const caller = appRouter.createCaller(ctx);

    const wallet1 = await caller.wallet.get();
    const wallet2 = await caller.wallet.get();

    expect(wallet1.id).toBe(wallet2.id);
  });
});

describe("Spin System", () => {
  it("should reject spin when no spins available", async () => {
    const { ctx } = createTestContext(998);
    const caller = appRouter.createCaller(ctx);

    const { upsertUser } = await import('./db');
    
    // إنشاء المستخدم في قاعدة البيانات
    await upsertUser({
      openId: 'test-user-998',
      name: 'Test User 998',
      email: 'test998@example.com',
      loginMethod: 'manus',
      lastIp: '127.0.0.1',
      lastDevice: 'test-device'
    });
    
    // تأكد من وجود محفظة بدون لفات
    await caller.wallet.get();

    await expect(caller.spin.execute()).rejects.toThrow("لا توجد لفات متاحة");
  });

  it("should execute spin successfully with available spins", async () => {
    const { ctx } = createTestContext(997);
    const caller = appRouter.createCaller(ctx);

    const db = await getDb();
    if (db) {
      const { wallets, users } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const { upsertUser } = await import('./db');
      
      // إنشاء المستخدم في قاعدة البيانات
      await upsertUser({
        openId: 'test-user-997',
        name: 'Test User 997',
        email: 'test997@example.com',
        loginMethod: 'manus',
        lastIp: '127.0.0.1',
        lastDevice: 'test-device'
      });
      
      // إنشاء المحفظة
      await caller.wallet.get();
      
      // إضافة لفات
      await db.update(wallets)
        .set({ availableSpins: 5 })
        .where(eq(wallets.userId, 997));
    }

    const result = await caller.spin.execute();

    expect(result).toBeDefined();
    expect(result.segmentId).toBeDefined();
    expect(result.amount).toBeGreaterThanOrEqual(0);
    expect(result.finalRotation).toBeGreaterThan(0);
    expect(result.signature).toBeDefined();
  });

  it("should update wallet after spin", async () => {
    const { ctx } = createTestContext(996);
    const caller = appRouter.createCaller(ctx);

    const db = await getDb();
    if (db) {
      const { wallets } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      const { upsertUser } = await import('./db');
      
      // إنشاء المستخدم
      await upsertUser({
        openId: 'test-user-996',
        name: 'Test User 996',
        email: 'test996@example.com',
        loginMethod: 'manus',
        lastIp: '127.0.0.1',
        lastDevice: 'test-device'
      });
      
      await caller.wallet.get();
      await db.update(wallets)
        .set({ availableSpins: 3 })
        .where(eq(wallets.userId, 996));
    }

    const walletBefore = await caller.wallet.get();
    await caller.spin.execute();
    const walletAfter = await caller.wallet.get();

    expect(walletAfter.availableSpins).toBe(walletBefore.availableSpins - 1);
  });
});

describe("Deposit System", () => {
  it("should calculate correct pricing for packages", async () => {
    const { PRICING } = await import('../shared/constants');

    expect(PRICING.SINGLE_SPIN).toBe(20); // 0.20$
    expect(PRICING.PACK_10.price).toBe(180); // 1.8$
    expect(PRICING.PACK_10.spins).toBe(10);
    expect(PRICING.PACK_50.price).toBe(800); // 8$
    expect(PRICING.PACK_100.price).toBe(1500); // 15$
  });
});

describe("Security System", () => {
  it("should generate valid HMAC signature", async () => {
    const { generateSpinSignature, verifySpinSignature } = await import('./wheelSystem');

    const userId = 1;
    const segmentId = 'small_win';
    const amount = 25;
    const timestamp = Date.now();

    const signature = generateSpinSignature(userId, segmentId, amount, timestamp);

    expect(signature).toBeDefined();
    expect(signature.length).toBeGreaterThan(0);

    const isValid = verifySpinSignature(userId, segmentId, amount, timestamp, signature);
    expect(isValid).toBe(true);
  });

  it("should reject invalid HMAC signature", async () => {
    const { verifySpinSignature, generateSpinSignature } = await import('./wheelSystem');

    const userId = 1;
    const segmentId = 'small_win';
    const amount = 25;
    const timestamp = Date.now();
    
    // توليد توقيع صحيح ثم تعديله
    const validSignature = generateSpinSignature(userId, segmentId, amount, timestamp);
    const invalidSignature = validSignature.slice(0, -1) + 'X'; // تغيير بسيط
    
    const isValid = verifySpinSignature(userId, segmentId, amount, timestamp, invalidSignature);
    expect(isValid).toBe(false);
  });

  it("should enforce spin cooldown", async () => {
    const { checkSpinCooldown } = await import('./wheelSystem');

    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5000);
    const fifteenSecondsAgo = new Date(now.getTime() - 15000);

    const canSpinRecent = await checkSpinCooldown(1, fiveSecondsAgo);
    const canSpinOld = await checkSpinCooldown(1, fifteenSecondsAgo);

    expect(canSpinRecent).toBe(false); // لا يمكن اللف (5 ثواني فقط)
    expect(canSpinOld).toBe(true); // يمكن اللف (15 ثانية)
  });
});

describe("Wheel Probabilities", () => {
  it("should have correct probability distribution", async () => {
    const { WHEEL_SEGMENTS } = await import('../shared/constants');

    const totalProbability = WHEEL_SEGMENTS.reduce((sum, seg) => sum + seg.probability, 0);

    expect(totalProbability).toBeCloseTo(1.0, 2);
    expect(WHEEL_SEGMENTS.find(s => s.id === 'loss')?.probability).toBe(0.45);
    expect(WHEEL_SEGMENTS.find(s => s.id === 'near_win')?.probability).toBe(0.25);
    expect(WHEEL_SEGMENTS.find(s => s.id === 'jackpot')?.probability).toBe(0.01);
  });

  it("should have correct segment values", async () => {
    const { WHEEL_SEGMENTS } = await import('../shared/constants');

    expect(WHEEL_SEGMENTS.find(s => s.id === 'loss')?.value).toBe(0);
    expect(WHEEL_SEGMENTS.find(s => s.id === 'small_win')?.value).toBe(25);
    expect(WHEEL_SEGMENTS.find(s => s.id === 'jackpot')?.value).toBe(500);
  });
});

describe("Admin System", () => {
  it("should allow admin to access admin routes", async () => {
    const { ctx } = createTestContext(1);
    ctx.user!.role = 'admin';
    const caller = appRouter.createCaller(ctx);

    const stats = await caller.stats.admin();
    expect(stats).toBeDefined();
  });

  it("should reject non-admin from admin routes", async () => {
    const { ctx } = createTestContext(2);
    ctx.user!.role = 'user';
    const caller = appRouter.createCaller(ctx);

    await expect(caller.stats.admin()).rejects.toThrow("Admin access required");
  });
});
