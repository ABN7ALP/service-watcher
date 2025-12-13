import crypto from 'crypto';
import { WHEEL_SEGMENTS, ADAPTIVE_SYSTEM, SECURITY_LIMITS } from '../shared/constants';
import { 
  getOrCreateUserDailyStat, 
  updateUserDailyStats,
  getUserById 
} from './db';

/**
 * نظام العجلة الذكي مع النسب التكيفية
 */

// ============= حساب النتيجة بناءً على النسب التكيفية =============

export async function calculateSpinResult(userId: number): Promise<{
  segmentId: string;
  segmentIndex: number;
  amount: number;
  finalRotation: number;
}> {
  // الحصول على إحصائيات المستخدم اليومية
  const today = new Date().toISOString().split('T')[0];
  const userStats = await getOrCreateUserDailyStat(userId, today);
  const user = await getUserById(userId);
  
  if (!user) {
    throw new Error('User not found');
  }
  
  // التحقق من حد الربح اليومي
  if (userStats.totalWinnings >= user.dailyWinLimit) {
    // إذا تجاوز الحد، نعطيه خسارة
    return generateResult('loss', 0);
  }
  
  // حساب النسب المعدلة بناءً على سلوك المستخدم
  const adjustedProbabilities = calculateAdaptiveProbabilities(userStats);
  
  // اختيار النتيجة بناءً على النسب المعدلة
  const selectedSegment = selectSegmentByProbability(adjustedProbabilities);
  
  return generateResult(selectedSegment.id, selectedSegment.value);
}

// ============= حساب النسب التكيفية =============

function calculateAdaptiveProbabilities(userStats: any) {
  const probabilities = WHEEL_SEGMENTS.map(segment => ({
    ...segment,
    adjustedProbability: segment.probability
  }));
  
  // إذا كان المستخدم جديد (أول لفة)
  if (userStats.spinsCount === 0 && ADAPTIVE_SYSTEM.FIRST_SPIN_GUARANTEED_WIN) {
    // نضمن له ربح صغير في أول لفة
    return probabilities.map(seg => ({
      ...seg,
      adjustedProbability: seg.id === 'small_win' ? 1.0 : 0
    }));
  }
  
  // إذا خسر عدة مرات متتالية
  if (userStats.consecutiveLosses >= ADAPTIVE_SYSTEM.CONSECUTIVE_LOSSES_THRESHOLD) {
    // نرفع احتمالية الربح
    return probabilities.map(seg => {
      if (seg.id === 'loss') {
        return { ...seg, adjustedProbability: seg.probability * 0.5 };
      } else if (seg.id === 'small_win' || seg.id === 'near_win') {
        return { ...seg, adjustedProbability: seg.probability * ADAPTIVE_SYSTEM.WIN_PROBABILITY_BOOST };
      }
      return seg;
    });
  }
  
  // إذا ربح عدة مرات متتالية
  if (userStats.consecutiveWins >= ADAPTIVE_SYSTEM.CONSECUTIVE_WINS_THRESHOLD) {
    // نخفض احتمالية الربح
    return probabilities.map(seg => {
      if (seg.id === 'loss') {
        return { ...seg, adjustedProbability: seg.probability * ADAPTIVE_SYSTEM.LOSS_PROBABILITY_BOOST };
      } else if (seg.id === 'big_win' || seg.id === 'jackpot') {
        return { ...seg, adjustedProbability: seg.probability * 0.3 };
      }
      return seg;
    });
  }
  
  // النسب العادية
  return probabilities;
}

// ============= اختيار القطاع بناءً على النسب =============

function selectSegmentByProbability(probabilities: any[]) {
  // تطبيع النسب لتكون مجموعها = 1
  const totalProb = probabilities.reduce((sum, seg) => sum + seg.adjustedProbability, 0);
  const normalizedProbs = probabilities.map(seg => ({
    ...seg,
    normalizedProbability: seg.adjustedProbability / totalProb
  }));
  
  // اختيار عشوائي بناءً على النسب
  const random = Math.random();
  let cumulative = 0;
  
  for (const segment of normalizedProbs) {
    cumulative += segment.normalizedProbability;
    if (random <= cumulative) {
      return segment;
    }
  }
  
  // fallback (لا يجب أن نصل هنا)
  return normalizedProbs[0];
}

// ============= توليد النتيجة النهائية =============

function generateResult(segmentId: string, amount: number) {
  // إيجاد index القطاع
  const segmentIndex = WHEEL_SEGMENTS.findIndex(seg => seg.id === segmentId);
  
  // حساب الزاوية النهائية
  const segmentAngle = 360 / WHEEL_SEGMENTS.length;
  const baseAngle = segmentIndex * segmentAngle;
  
  // إضافة دورات كاملة عشوائية
  const fullRotations = Math.floor(
    Math.random() * (5 - 3 + 1) + 3
  ); // 3-5 دورات
  
  // إضافة زاوية عشوائية داخل القطاع
  const randomOffset = Math.random() * segmentAngle;
  
  const finalRotation = fullRotations * 360 + baseAngle + randomOffset;
  
  return {
    segmentId,
    segmentIndex,
    amount,
    finalRotation
  };
}

// ============= توقيع HMAC للنتيجة =============

export function generateSpinSignature(
  userId: number,
  segmentId: string,
  amount: number,
  timestamp: number
): string {
  const secret = process.env.JWT_SECRET || 'default-secret';
  const data = `${userId}:${segmentId}:${amount}:${timestamp}`;
  
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
}

// ============= التحقق من توقيع HMAC =============

export function verifySpinSignature(
  userId: number,
  segmentId: string,
  amount: number,
  timestamp: number,
  signature: string
): boolean {
  const expectedSignature = generateSpinSignature(userId, segmentId, amount, timestamp);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// ============= التحقق من Rate Limiting =============

export async function checkSpinCooldown(userId: number, lastSpinTime: Date | null): Promise<boolean> {
  if (!lastSpinTime) return true;
  
  const now = new Date();
  const timeDiff = (now.getTime() - lastSpinTime.getTime()) / 1000; // بالثواني
  
  return timeDiff >= SECURITY_LIMITS.SPIN_COOLDOWN;
}

// ============= تحديث إحصائيات المستخدم بعد اللفة =============

export async function updateUserStatsAfterSpin(
  userId: number,
  segmentId: string,
  amount: number
) {
  const today = new Date().toISOString().split('T')[0];
  const userStats = await getOrCreateUserDailyStat(userId, today);
  
  const isWin = amount > 0;
  
  await updateUserDailyStats(userId, today, {
    spinsCount: userStats.spinsCount + 1,
    totalWinnings: isWin ? userStats.totalWinnings + amount : userStats.totalWinnings,
    totalLosses: !isWin ? userStats.totalLosses + 1 : userStats.totalLosses,
    consecutiveWins: isWin ? userStats.consecutiveWins + 1 : 0,
    consecutiveLosses: !isWin ? userStats.consecutiveLosses + 1 : 0
  });
}

// ============= التحقق من النشاط المشبوه =============

export function detectSuspiciousActivity(
  spinsInLastMinute: number,
  consecutiveWins: number,
  totalWinnings: number
): boolean {
  // أكثر من 10 لفات في دقيقة واحدة
  if (spinsInLastMinute > 10) return true;
  
  // أكثر من 10 انتصارات متتالية (احتمال غش)
  if (consecutiveWins > 10) return true;
  
  // أرباح غير طبيعية (أكثر من 1000$ في يوم واحد)
  if (totalWinnings > 100000) return true;
  
  return false;
}

// ============= حساب الأرباح المتوقعة للنظام =============

export function calculateExpectedProfit(spinsCount: number): number {
  // تكلفة اللفة = 0.20$
  // متوسط الربح المتوقع للمستخدم = 0.14$
  // الفرق = 0.06$ ربح صافي لكل لفة
  
  const profitPerSpin = 6; // 0.06$ بالسنت
  return spinsCount * profitPerSpin;
}
