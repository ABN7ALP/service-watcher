import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { centsToDollars, SECURITY_LIMITS } from "@shared/constants";
import { Loader2, ArrowLeft, DollarSign, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function Withdrawal() {
  const { user, isAuthenticated, loading } = useAuth();
  const [amount, setAmount] = useState("");
  const [shamCashAccount, setShamCashAccount] = useState("");
  const [shamCashName, setShamCashName] = useState("");
  
  const { data: wallet } = trpc.wallet.get.useQuery(undefined, {
    enabled: isAuthenticated
  });
  
  const { data: myWithdrawals, refetch } = trpc.withdrawal.getMy.useQuery(undefined, {
    enabled: isAuthenticated
  });
  
  const createWithdrawalMutation = trpc.withdrawal.create.useMutation({
    onSuccess: () => {
      toast.success('تم إرسال طلب السحب بنجاح!', {
        description: 'سيتم معالجة طلبك خلال 24-48 ساعة'
      });
      setAmount("");
      setShamCashAccount("");
      setShamCashName("");
      refetch();
    },
    onError: (error) => {
      toast.error('خطأ', { description: error.message });
    }
  });
  
  const handleSubmit = () => {
    const amountInCents = Math.round(parseFloat(amount) * 100);
    
    if (!amount || isNaN(amountInCents) || amountInCents <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }
    
    if (amountInCents < SECURITY_LIMITS.MIN_WITHDRAWAL) {
      toast.error(`الحد الأدنى للسحب هو ${centsToDollars(SECURITY_LIMITS.MIN_WITHDRAWAL)}$`);
      return;
    }
    
    if (!wallet || amountInCents > wallet.availableBalance) {
      toast.error('رصيدك غير كافٍ');
      return;
    }
    
    if (!shamCashAccount || shamCashAccount.length < 5) {
      toast.error('يرجى إدخال رقم حساب شام كاش صحيح');
      return;
    }
    
    if (!shamCashName || shamCashName.length < 3) {
      toast.error('يرجى إدخال الاسم الكامل');
      return;
    }
    
    createWithdrawalMutation.mutate({
      amount: amountInCents,
      shamCashAccount,
      shamCashName
    });
  };
  
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
            <CardDescription>يجب تسجيل الدخول للوصول إلى صفحة السحب</CardDescription>
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
            سحب الأرباح
          </h1>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* نموذج السحب */}
          <div>
            <Card className="bg-gray-800/50 border-gray-700 mb-6">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-yellow-900/30 to-orange-900/30 rounded-lg border border-yellow-700">
                  <DollarSign className="w-8 h-8 text-yellow-400" />
                  <div>
                    <p className="text-sm text-gray-400">رصيدك المتاح</p>
                    <p className="text-2xl font-bold text-yellow-400">
                      {wallet ? centsToDollars(wallet.availableBalance) : '0.00'}$
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-yellow-400">طلب سحب جديد</CardTitle>
                <CardDescription>
                  الحد الأدنى للسحب: {centsToDollars(SECURITY_LIMITS.MIN_WITHDRAWAL)}$
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amount">المبلغ (بالدولار)</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    min="10"
                    placeholder="10.00"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-gray-700 border-gray-600"
                  />
                  <p className="text-xs text-gray-400">
                    المبلغ بالسنت: {amount ? Math.round(parseFloat(amount) * 100) : 0}¢
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="account">رقم حساب شام كاش</Label>
                  <Input
                    id="account"
                    type="text"
                    placeholder="09XXXXXXXX"
                    value={shamCashAccount}
                    onChange={(e) => setShamCashAccount(e.target.value)}
                    className="bg-gray-700 border-gray-600"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="name">الاسم الكامل (كما في شام كاش)</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="محمد أحمد"
                    value={shamCashName}
                    onChange={(e) => setShamCashName(e.target.value)}
                    className="bg-gray-700 border-gray-600"
                  />
                </div>
                
                <div className="p-4 bg-blue-900/20 border border-blue-700 rounded-lg">
                  <p className="text-sm text-blue-300">
                    ℹ️ سيتم تحويل المبلغ إلى حسابك خلال 24-48 ساعة عمل بعد الموافقة
                  </p>
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={createWithdrawalMutation.isPending}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 hover:from-yellow-500 hover:to-orange-600"
                  size="lg"
                >
                  {createWithdrawalMutation.isPending ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin ml-2" />
                      جاري الإرسال...
                    </>
                  ) : (
                    'إرسال الطلب'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
          
          {/* الطلبات السابقة */}
          <div>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle>طلبات السحب</CardTitle>
                <CardDescription>سجل طلبات السحب الخاصة بك</CardDescription>
              </CardHeader>
              <CardContent>
                {!myWithdrawals || myWithdrawals.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد طلبات سحب</p>
                ) : (
                  <div className="space-y-3">
                    {myWithdrawals.map((withdrawal: any) => (
                      <div key={withdrawal.id} className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-yellow-400">{centsToDollars(withdrawal.amount)}$</p>
                            <p className="text-sm text-gray-400">{withdrawal.shamCashAccount}</p>
                            <p className="text-xs text-gray-500">{withdrawal.shamCashName}</p>
                          </div>
                          <div className="text-left">
                            {withdrawal.status === 'pending' && (
                              <span className="text-xs bg-yellow-600 px-2 py-1 rounded">قيد المعالجة</span>
                            )}
                            {withdrawal.status === 'approved' && (
                              <span className="text-xs bg-green-600 px-2 py-1 rounded flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                تم التحويل
                              </span>
                            )}
                            {withdrawal.status === 'rejected' && (
                              <span className="text-xs bg-red-600 px-2 py-1 rounded">مرفوض</span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(withdrawal.createdAt).toLocaleString('ar-EG')}
                        </p>
                        {withdrawal.transferReference && (
                          <p className="text-xs text-green-400 mt-2 p-2 bg-gray-800 rounded">
                            رقم التحويل: {withdrawal.transferReference}
                          </p>
                        )}
                        {withdrawal.reviewNotes && (
                          <p className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded">
                            ملاحظة: {withdrawal.reviewNotes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
