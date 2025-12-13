import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { centsToDollars } from "@shared/constants";
import { Loader2, ArrowLeft, TrendingUp, TrendingDown } from "lucide-react";
import { Link } from "wouter";

export default function History() {
  const { user, isAuthenticated, loading } = useAuth();
  
  const { data: spins, isLoading: spinsLoading } = trpc.spin.getHistory.useQuery({ limit: 100 }, {
    enabled: isAuthenticated
  });
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <Loader2 className="w-12 h-12 animate-spin text-yellow-400" />
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900">
        <Card className="bg-gray-800/50 border-gray-700 max-w-md">
          <CardHeader>
            <CardTitle className="text-yellow-400">تسجيل الدخول مطلوب</CardTitle>
            <CardDescription>يجب تسجيل الدخول للوصول إلى سجل اللفات</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900">
              <a href={getLoginUrl()}>تسجيل الدخول</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // حساب الإحصائيات
  const totalSpins = spins?.length || 0;
  const totalWinnings = spins?.reduce((sum: number, spin: any) => sum + spin.amount, 0) || 0;
  const wins = spins?.filter((spin: any) => spin.amount > 0).length || 0;
  const losses = spins?.filter((spin: any) => spin.amount === 0).length || 0;
  const winRate = totalSpins > 0 ? ((wins / totalSpins) * 100).toFixed(1) : '0.0';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <Link href="/">
            <Button variant="ghost" className="mb-2">
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة للرئيسية
            </Button>
          </Link>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            سجل اللفات
          </h1>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        {/* الإحصائيات */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-1">إجمالي اللفات</p>
                <p className="text-3xl font-bold text-blue-400">{totalSpins}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-1">إجمالي الأرباح</p>
                <p className="text-3xl font-bold text-yellow-400">{centsToDollars(totalWinnings)}$</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-1">نسبة الفوز</p>
                <p className="text-3xl font-bold text-green-400">{winRate}%</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-1">فوز / خسارة</p>
                <p className="text-3xl font-bold">
                  <span className="text-green-400">{wins}</span>
                  <span className="text-gray-500 mx-2">/</span>
                  <span className="text-red-400">{losses}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* جدول السجل */}
        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle>سجل اللفات التفصيلي</CardTitle>
            <CardDescription>آخر 100 لفة</CardDescription>
          </CardHeader>
          <CardContent>
            {spinsLoading ? (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 animate-spin mx-auto text-yellow-400" />
              </div>
            ) : !spins || spins.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-4">لم تقم بأي لفات بعد</p>
                <Link href="/">
                  <Button className="bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900">
                    ابدأ اللعب الآن
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">النتيجة</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الرصيد بعد</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {spins.map((spin: any) => (
                      <TableRow key={spin.id}>
                        <TableCell className="text-sm text-gray-400">
                          {new Date(spin.createdAt).toLocaleString('ar-EG', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell>
                          {spin.result === 'loss' && (
                            <Badge variant="destructive" className="flex items-center gap-1 w-fit">
                              <TrendingDown className="w-3 h-3" />
                              خسارة
                            </Badge>
                          )}
                          {spin.result === 'near_win' && (
                            <Badge variant="outline" className="bg-orange-900/30 border-orange-600 flex items-center gap-1 w-fit">
                              قريب!
                            </Badge>
                          )}
                          {spin.result === 'small_win' && (
                            <Badge variant="default" className="bg-blue-600 flex items-center gap-1 w-fit">
                              <TrendingUp className="w-3 h-3" />
                              ربح صغير
                            </Badge>
                          )}
                          {spin.result === 'medium_win' && (
                            <Badge variant="default" className="bg-green-600 flex items-center gap-1 w-fit">
                              <TrendingUp className="w-3 h-3" />
                              ربح متوسط
                            </Badge>
                          )}
                          {spin.result === 'big_win' && (
                            <Badge variant="default" className="bg-purple-600 flex items-center gap-1 w-fit">
                              <TrendingUp className="w-3 h-3" />
                              ربح كبير
                            </Badge>
                          )}
                          {spin.result === 'jackpot' && (
                            <Badge variant="default" className="bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 flex items-center gap-1 w-fit">
                              <TrendingUp className="w-3 h-3" />
                              🎰 JACKPOT
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {spin.amount > 0 ? (
                            <span className="text-green-400 font-bold">
                              +{centsToDollars(spin.amount)}$
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-yellow-400 font-medium">
                          {centsToDollars(spin.balanceAfter)}$
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
