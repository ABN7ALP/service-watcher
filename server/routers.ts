import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { 
  getOrCreateWallet, 
  updateWalletBalance,
  createDeposit,
  createWithdrawal,
  getPendingDeposits,
  getPendingWithdrawals,
  getDepositById,
  getWithdrawalById,
  updateDepositStatus,
  updateWithdrawalStatus,
  createSpin,
  getUserSpins,
  getRecentSpins,
  getDailyStats,
  getOrCreateDailyStat,
  updateDailyStats,
  createActivityLog,
  getSuspiciousActivities,
  getUserActivities,
  updateUserBlockStatus,
  getUserById,
  getDb
} from "./db";
import { 
  calculateSpinResult, 
  generateSpinSignature,
  checkSpinCooldown,
  updateUserStatsAfterSpin,
  detectSuspiciousActivity
} from "./wheelSystem";
import { storagePut } from "./storage";
import { notifyOwner } from "./_core/notification";
import { PRICING, SECURITY_LIMITS, centsToDollars } from "../shared/constants";
import { sql } from "drizzle-orm";
import { spins } from "../drizzle/schema";

// Admin-only procedure
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const appRouter = router({
  system: systemRouter,
  
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ============= Wallet APIs =============
  wallet: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const wallet = await getOrCreateWallet(ctx.user.id);
      return wallet;
    }),
    
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(50) }))
      .query(async ({ ctx, input }) => {
        const spinsHistory = await getUserSpins(ctx.user.id, input.limit);
        return spinsHistory;
      }),
  }),

  // ============= Deposit APIs =============
  deposit: router({
    create: protectedProcedure
      .input(z.object({
        packageType: z.enum(['single', 'pack_10', 'pack_50', 'pack_100']),
        receiptFile: z.instanceof(Buffer),
        receiptFileName: z.string()
      }))
      .mutation(async ({ ctx, input }) => {
        // حساب المبلغ وعدد اللفات
        let amount: number;
        let spinsCount: number;
        
        switch (input.packageType) {
          case 'single':
            amount = PRICING.SINGLE_SPIN;
            spinsCount = 1;
            break;
          case 'pack_10':
            amount = PRICING.PACK_10.price;
            spinsCount = PRICING.PACK_10.spins;
            break;
          case 'pack_50':
            amount = PRICING.PACK_50.price;
            spinsCount = PRICING.PACK_50.spins;
            break;
          case 'pack_100':
            amount = PRICING.PACK_100.price;
            spinsCount = PRICING.PACK_100.spins;
            break;
        }
        
        // رفع الإيصال على S3
        const timestamp = Date.now();
        const fileKey = `receipts/${ctx.user.id}/${timestamp}-${input.receiptFileName}`;
        const { url: receiptUrl } = await storagePut(fileKey, input.receiptFile, 'image/jpeg');
        
        // إنشاء طلب الشحن
        await createDeposit({
          userId: ctx.user.id,
          amount,
          packageType: input.packageType,
          spinsCount,
          receiptUrl,
          status: 'pending'
        });
        
        // إشعار المالك
        await notifyOwner({
          title: 'طلب شحن جديد',
          content: `المستخدم ${ctx.user.name} طلب شحن ${spinsCount} لفة بقيمة ${centsToDollars(amount)}$`
        });
        
        // تسجيل النشاط
        await createActivityLog({
          userId: ctx.user.id,
          activityType: 'deposit_request',
          details: `Requested ${spinsCount} spins for ${centsToDollars(amount)}$`,
          ipAddress: ctx.req.ip || 'unknown',
          deviceInfo: ctx.req.headers['user-agent'] || null,
          isSuspicious: false
        });
        
        return { success: true };
      }),
    
    getMy: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { deposits } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      
      return await db.select()
        .from(deposits)
        .where(eq(deposits.userId, ctx.user.id))
        .orderBy(desc(deposits.createdAt))
        .limit(20);
    }),
    
    getPending: adminProcedure.query(async () => {
      return await getPendingDeposits();
    }),
    
    review: adminProcedure
      .input(z.object({
        depositId: z.number(),
        action: z.enum(['approve', 'reject']),
        notes: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const deposit = await getDepositById(input.depositId);
        if (!deposit) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Deposit not found' });
        }
        
        if (input.action === 'approve') {
          // تحديث المحفظة
          await updateWalletBalance(
            deposit.userId,
            0, // لا نضيف رصيد نقدي
            0,
            deposit.spinsCount // نضيف اللفات
          );
          
          await updateDepositStatus(input.depositId, 'approved', ctx.user.id, input.notes);
        } else {
          await updateDepositStatus(input.depositId, 'rejected', ctx.user.id, input.notes);
        }
        
        return { success: true };
      }),
  }),

  // ============= Withdrawal APIs =============
  withdrawal: router({
    create: protectedProcedure
      .input(z.object({
        amount: z.number().min(SECURITY_LIMITS.MIN_WITHDRAWAL),
        shamCashAccount: z.string().min(1),
        shamCashName: z.string().min(1)
      }))
      .mutation(async ({ ctx, input }) => {
        const wallet = await getOrCreateWallet(ctx.user.id);
        
        // التحقق من الرصيد
        if (wallet.availableBalance < input.amount) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'رصيد غير كافٍ' 
          });
        }
        
        // خصم المبلغ من الرصيد المتاح ونقله إلى pending
        await updateWalletBalance(ctx.user.id, -input.amount, input.amount, 0);
        
        // إنشاء طلب السحب
        await createWithdrawal({
          userId: ctx.user.id,
          amount: input.amount,
          shamCashAccount: input.shamCashAccount,
          shamCashName: input.shamCashName,
          status: 'pending'
        });
        
        // إشعار المالك
        await notifyOwner({
          title: 'طلب سحب جديد',
          content: `المستخدم ${ctx.user.name} طلب سحب ${centsToDollars(input.amount)}$`
        });
        
        // تسجيل النشاط
        await createActivityLog({
          userId: ctx.user.id,
          activityType: 'withdrawal_request',
          details: `Requested withdrawal of ${centsToDollars(input.amount)}$`,
          ipAddress: ctx.req.ip || 'unknown',
          deviceInfo: ctx.req.headers['user-agent'] || null,
          isSuspicious: false
        });
        
        return { success: true };
      }),
    
    getMy: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      
      const { withdrawals } = await import('../drizzle/schema');
      const { eq, desc } = await import('drizzle-orm');
      
      return await db.select()
        .from(withdrawals)
        .where(eq(withdrawals.userId, ctx.user.id))
        .orderBy(desc(withdrawals.createdAt))
        .limit(20);
    }),
    
    getPending: adminProcedure.query(async () => {
      return await getPendingWithdrawals();
    }),
    
    process: adminProcedure
      .input(z.object({
        withdrawalId: z.number(),
        action: z.enum(['approve', 'reject']),
        notes: z.string().optional(),
        transferReference: z.string().optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const withdrawal = await getWithdrawalById(input.withdrawalId);
        if (!withdrawal) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Withdrawal not found' });
        }
        
        if (input.action === 'approve') {
          // إزالة المبلغ من pending (تم التحويل)
          await updateWalletBalance(withdrawal.userId, 0, -withdrawal.amount, 0);
          await updateWithdrawalStatus(
            input.withdrawalId, 
            'completed', 
            ctx.user.id, 
            input.notes,
            input.transferReference
          );
        } else {
          // إرجاع المبلغ إلى available
          await updateWalletBalance(withdrawal.userId, withdrawal.amount, -withdrawal.amount, 0);
          await updateWithdrawalStatus(input.withdrawalId, 'rejected', ctx.user.id, input.notes);
        }
        
        return { success: true };
      }),
  }),

  // ============= Spin APIs =============
  spin: router({
    execute: protectedProcedure.mutation(async ({ ctx }) => {
      const user = await getUserById(ctx.user.id);
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      
      // التحقق من الحظر
      if (user.isBlocked) {
        throw new TRPCError({ 
          code: 'FORBIDDEN', 
          message: `حسابك محظور: ${user.blockReason}` 
        });
      }
      
      const wallet = await getOrCreateWallet(ctx.user.id);
      
      // التحقق من اللفات المتاحة
      if (wallet.availableSpins <= 0) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'لا توجد لفات متاحة. قم بشحن رصيدك أولاً.' 
        });
      }
      
      // التحقق من Rate Limiting
      const recentSpins = await getUserSpins(ctx.user.id, 1);
      const lastSpinTime = recentSpins.length > 0 ? recentSpins[0].createdAt : null;
      const canSpin = await checkSpinCooldown(ctx.user.id, lastSpinTime);
      
      if (!canSpin) {
        throw new TRPCError({ 
          code: 'TOO_MANY_REQUESTS', 
          message: `يجب الانتظار ${SECURITY_LIMITS.SPIN_COOLDOWN} ثواني بين اللفات` 
        });
      }
      
      // حساب النتيجة
      const result = await calculateSpinResult(ctx.user.id);
      
      // توقيع النتيجة
      const timestamp = Date.now();
      const signature = generateSpinSignature(
        ctx.user.id,
        result.segmentId,
        result.amount,
        timestamp
      );
      
      // تحديث المحفظة (خصم لفة، إضافة الربح إن وجد)
      const balanceBefore = wallet.availableBalance;
      await updateWalletBalance(ctx.user.id, result.amount, 0, -1);
      const balanceAfter = balanceBefore + result.amount;
      
      // تسجيل اللفة
      await createSpin({
        userId: ctx.user.id,
        result: result.segmentId as any,
        amount: result.amount,
        segmentIndex: result.segmentIndex,
        finalRotation: result.finalRotation,
        signature,
        ipAddress: ctx.req.ip || 'unknown',
        deviceInfo: ctx.req.headers['user-agent'] || null,
        balanceBefore,
        balanceAfter
      });
      
      // تحديث إحصائيات المستخدم
      await updateUserStatsAfterSpin(ctx.user.id, result.segmentId, result.amount);
      
      // تحديث الإحصائيات اليومية
      const today = new Date().toISOString().split('T')[0];
      const dailyStat = await getOrCreateDailyStat(today);
      
      await updateDailyStats(today, {
        totalSpins: dailyStat.totalSpins + 1,
        totalWinnings: dailyStat.totalWinnings + result.amount,
        biggestWin: Math.max(dailyStat.biggestWin, result.amount),
        biggestWinUser: result.amount > dailyStat.biggestWin ? user.name || 'مجهول' : dailyStat.biggestWinUser,
        jackpotCount: result.segmentId === 'jackpot' ? dailyStat.jackpotCount + 1 : dailyStat.jackpotCount
      });
      
      // تسجيل النشاط
      await createActivityLog({
        userId: ctx.user.id,
        activityType: 'spin',
        details: `Spun and got ${result.segmentId} (${centsToDollars(result.amount)}$)`,
        ipAddress: ctx.req.ip || 'unknown',
        deviceInfo: ctx.req.headers['user-agent'] || null,
        isSuspicious: false
      });
      
      return {
        ...result,
        signature,
        timestamp,
        balanceAfter
      };
    }),
    
    getHistory: protectedProcedure
      .input(z.object({ limit: z.number().optional().default(50) }))
      .query(async ({ ctx, input }) => {
        return await getUserSpins(ctx.user.id, input.limit);
      }),
  }),

  // ============= Stats APIs =============
  stats: router({
    public: publicProcedure.query(async () => {
      const today = new Date().toISOString().split('T')[0];
      const stats = await getDailyStats(today);
      
      if (!stats) {
        return {
          activePlayers: 0,
          totalSpins: 0,
          totalWinnings: 0,
          biggestWin: 0,
          biggestWinUser: null
        };
      }
      
      return {
        activePlayers: stats.activePlayers,
        totalSpins: stats.totalSpins,
        totalWinnings: stats.totalWinnings,
        biggestWin: stats.biggestWin,
        biggestWinUser: stats.biggestWinUser
      };
    }),
    
    admin: adminProcedure.query(async () => {
      const today = new Date().toISOString().split('T')[0];
      const stats = await getDailyStats(today);
      const recentSpins = await getRecentSpins(100);
      const suspiciousActivities = await getSuspiciousActivities(50);
      
      return {
        daily: stats,
        recentSpins,
        suspiciousActivities
      };
    }),
  }),

  // ============= Admin APIs =============
  admin: router({
    getUsers: adminProcedure
      .input(z.object({ 
        limit: z.number().optional().default(100),
        offset: z.number().optional().default(0)
      }))
      .query(async ({ input }) => {
        const db = await getDb();
        if (!db) return [];
        
        const { users } = await import('../drizzle/schema');
        return await db.select()
          .from(users)
          .limit(input.limit)
          .offset(input.offset);
      }),
    
    blockUser: adminProcedure
      .input(z.object({
        userId: z.number(),
        reason: z.string()
      }))
      .mutation(async ({ input }) => {
        await updateUserBlockStatus(input.userId, true, input.reason);
        return { success: true };
      }),
    
    unblockUser: adminProcedure
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ input }) => {
        await updateUserBlockStatus(input.userId, false);
        return { success: true };
      }),
    
    getUserActivities: adminProcedure
      .input(z.object({ userId: z.number() }))
      .query(async ({ input }) => {
        return await getUserActivities(input.userId);
      }),
  }),
});

export type AppRouter = typeof appRouter;
