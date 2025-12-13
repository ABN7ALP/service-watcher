import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FortuneWheel } from "@/components/FortuneWheel";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { centsToDollars, MOTIVATIONAL_MESSAGES, PRICING } from "@shared/constants";
import { Loader2, Coins, TrendingUp, Users } from "lucide-react";

export default function Home() {
  const { user, isAuthenticated, loading } = useAuth();
  const [isSpinning, setIsSpinning] = useState(false);
  const [finalRotation, setFinalRotation] = useState(0);
  const [winningSegmentId, setWinningSegmentId] = useState<string>('');
  const [lastSpinTime, setLastSpinTime] = useState<number>(0);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  
  const { data: wallet, refetch: refetchWallet } = trpc.wallet.get.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000
  });
  
  const { data: publicStats } = trpc.stats.public.useQuery(undefined, {
    refetchInterval: 10000
  });
  
  const spinMutation = trpc.spin.execute.useMutation({
    onSuccess: (data) => {
      setFinalRotation(data.finalRotation);
      setWinningSegmentId(data.segmentId);
      setIsSpinning(true);
      setLastSpinTime(Date.now());
      
      // بعد انتهاء الدوران
      setTimeout(() => {
        setIsSpinning(false);
        refetchWallet();
        
        // عرض رسالة تحفيزية
        const messages = MOTIVATIONAL_MESSAGES[data.segmentId as keyof typeof MOTIVATIONAL_MESSAGES];
        const randomMessage = messages[Math.floor(Math.random() * messages.length)];
        
        if (data.amount > 0) {
          toast.success(randomMessage, {
            description: `ربحت ${centsToDollars(data.amount)}$! رصيدك الجديد: ${centsToDollars(data.balanceAfter)}$`
          });
        } else {
          toast.info(randomMessage, {
            description: 'جرب حظك مرة تانية!'
          });
        }
      }, 5000);
    },
    onError: (error) => {
      toast.error('خطأ', {
        description: error.message
      });
      setIsSpinning(false);
    }
  });
  
  const handleSpin = () => {
    if (!isAuthenticated) {
      toast.error('يجب تسجيل الدخول أولاً');
      return;
    }
    
    if (isSpinning) return;
    
    // التحقق من cooldown
    const now = Date.now();
    const timeSinceLastSpin = (now - lastSpinTime) / 1000;
    if (timeSinceLastSpin < 10 && lastSpinTime > 0) {
      const remaining = Math.ceil(10 - timeSinceLastSpin);
      toast.warning(`انتظر ${remaining} ثانية`);
      return;
    }
    
    spinMutation.mutate();
  };
  
  // تحديث العداد التنازلي
  useState(() => {
    const interval = setInterval(() => {
      if (lastSpinTime > 0) {
        const now = Date.now();
        const timeSinceLastSpin = (now - lastSpinTime) / 1000;
        const remaining = Math.max(0, Math.ceil(10 - timeSinceLastSpin));
        setCooldownRemaining(remaining);
      }
    }, 100);
    
    return () => clearInterval(interval);
  });
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <Loader2 className="w-12 h-12 animate-spin text-yellow-400" />
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                <span className="text-2xl">🎰</span>
              </div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
                عجلة الحظ
              </h1>
            </div>
          
          </div>
          
          {/* قائمة التنقل */}
          {isAuthenticated && (
            <nav className="flex gap-2 flex-wrap">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-yellow-400">
                  🎰 اللعب
                </Button>
              </Link>
              <Link href="/deposit">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-yellow-400">
                  💰 شحن الرصيد
                </Button>
              </Link>
              <Link href="/withdrawal">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-yellow-400">
                  💵 سحب الأرباح
                </Button>
              </Link>
              <Link href="/history">
                <Button variant="ghost" size="sm" className="text-gray-300 hover:text-yellow-400">
                  📊 سجل اللفات
                </Button>
              </Link>
              {user?.role === 'admin' && (
                <Link href="/admin">
                  <Button variant="ghost" size="sm" className="text-gray-300 hover:text-red-400">
                    ⚙️ لوحة الإدارة
                  </Button>
                </Link>
              )}
            </nav>
          )}
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        {/* Stats Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-sm text-gray-400">اللاعبين اليوم</p>
                  <p className="text-2xl font-bold">{publicStats?.activePlayers || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Coins className="w-8 h-8 text-yellow-400" />
                <div>
                  <p className="text-sm text-gray-400">إجمالي الأرباح اليوم</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {centsToDollars(publicStats?.totalWinnings || 0)}$
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-400" />
                <div>
                  <p className="text-sm text-gray-400">أكبر فوز اليوم</p>
                  <p className="text-2xl font-bold text-green-400">
                    {centsToDollars(publicStats?.biggestWin || 0)}$
                  </p>
                  {publicStats?.biggestWinUser && (
                    <p className="text-xs text-gray-500">{publicStats.biggestWinUser}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Wheel Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Wheel */}
          <div className="lg:col-span-2">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardContent className="p-8">
                <FortuneWheel
                  isSpinning={isSpinning}
                  finalRotation={finalRotation}
                  winningSegmentId={winningSegmentId}
                />
                
                <div className="mt-8 text-center">
                  <Button
                    onClick={handleSpin}
                    disabled={!isAuthenticated || isSpinning || (wallet?.availableSpins || 0) <= 0 || cooldownRemaining > 0}
                    size="lg"
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 hover:from-yellow-500 hover:to-orange-600 text-xl px-12 py-6 disabled:opacity-50"
                  >
                    {isSpinning ? (
                      <>
                        <Loader2 className="w-6 h-6 animate-spin ml-2" />
                        جاري الدوران...
                      </>
                    ) : cooldownRemaining > 0 ? (
                      `انتظر ${cooldownRemaining}ث`
                    ) : (
                      'لف العجلة! 🎰'
                    )}
                  </Button>
                  
                  {!isAuthenticated && (
                    <p className="mt-4 text-gray-400">سجل دخولك للعب!</p>
                  )}
                  
                  {isAuthenticated && (wallet?.availableSpins || 0) <= 0 && (
                    <p className="mt-4 text-yellow-400">لا توجد لفات متاحة. اشحن رصيدك!</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Packages */}
          <div className="space-y-4">
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-yellow-400">باقات اللفات</CardTitle>
                <CardDescription>اختر الباقة المناسبة لك</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-bold">لفة واحدة</span>
                    <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.SINGLE_SPIN)}$</span>
                  </div>
                  <Button className="w-full" variant="outline">شراء</Button>
                </div>
                
                <div className="p-4 bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-lg border border-blue-600">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">10 لفات</span>
                    <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_10.price)}$</span>
                  </div>
                  <p className="text-xs text-green-400 mb-2">وفر {PRICING.PACK_10.savings}%</p>
                  <Button className="w-full bg-blue-600 hover:bg-blue-700">شراء</Button>
                </div>
                
                <div className="p-4 bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg border border-purple-600">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">50 لفة</span>
                    <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_50.price)}$</span>
                  </div>
                  <p className="text-xs text-green-400 mb-2">وفر {PRICING.PACK_50.savings}%</p>
                  <Button className="w-full bg-purple-600 hover:bg-purple-700">شراء</Button>
                </div>
                
                <div className="p-4 bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-lg border border-orange-600 relative overflow-hidden">
                  <div className="absolute top-0 right-0 bg-red-600 text-white text-xs px-2 py-1 rounded-bl-lg">
                    الأفضل!
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold">100 لفة</span>
                    <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_100.price)}$</span>
                  </div>
                  <p className="text-xs text-green-400 mb-2">وفر {PRICING.PACK_100.savings}%</p>
                  <Button className="w-full bg-orange-600 hover:bg-orange-700">شراء</Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Recent Wins */}
            <Card className="bg-gray-800/50 border-gray-700 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-green-400">أرباح حديثة 🎉</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                  <span>أحمد</span>
                  <span className="text-yellow-400 font-bold">5.00$</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                  <span>فاطمة</span>
                  <span className="text-yellow-400 font-bold">1.00$</span>
                </div>
                <div className="flex justify-between items-center p-2 bg-gray-700/30 rounded">
                  <span>محمد</span>
                  <span className="text-yellow-400 font-bold">0.50$</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
