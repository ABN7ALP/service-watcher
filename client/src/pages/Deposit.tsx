import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { centsToDollars, PRICING } from "@shared/constants";
import { Loader2, Upload, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";

export default function Deposit() {
  const { user, isAuthenticated, loading } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<'single' | 'pack_10' | 'pack_50' | 'pack_100'>('pack_10');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  
  const { data: pendingDeposits, refetch } = trpc.deposit.getMy.useQuery(undefined, {
    enabled: isAuthenticated
  });
  
  const createDepositMutation = trpc.deposit.create.useMutation({
    onSuccess: () => {
      toast.success('تم إرسال طلب الشحن بنجاح!', {
        description: 'سيتم مراجعة طلبك خلال 24 ساعة'
      });
      setReceiptFile(null);
      refetch();
    },
    onError: (error) => {
      toast.error('خطأ', { description: error.message });
      setUploading(false);
    }
  });
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // التحقق من نوع الملف
      if (!file.type.startsWith('image/')) {
        toast.error('يجب أن يكون الملف صورة');
        return;
      }
      // التحقق من حجم الملف (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('حجم الملف يجب أن يكون أقل من 5MB');
        return;
      }
      setReceiptFile(file);
    }
  };
  
  const handleSubmit = async () => {
    if (!receiptFile) {
      toast.error('يرجى رفع صورة الإيصال');
      return;
    }
    
    setUploading(true);
    
    try {
      // تحويل الملف إلى Base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        
        let packageType: 'single' | 'pack_10' | 'pack_50' | 'pack_100';
        let amount: number;
        let spins: number;
        
        switch (selectedPackage) {
          case 'single':
            packageType = 'single';
            amount = PRICING.SINGLE_SPIN;
            spins = 1;
            break;
          case 'pack_10':
            packageType = 'pack_10';
            amount = PRICING.PACK_10.price;
            spins = PRICING.PACK_10.spins;
            break;
          case 'pack_50':
            packageType = 'pack_50';
            amount = PRICING.PACK_50.price;
            spins = PRICING.PACK_50.spins;
            break;
          case 'pack_100':
            packageType = 'pack_100';
            amount = PRICING.PACK_100.price;
            spins = PRICING.PACK_100.spins;
            break;
        }
        
        // تحويل base64 إلى Buffer
        const base64Data = base64.split(',')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        
        createDepositMutation.mutate({
          packageType,
          receiptFile: buffer,
          receiptFileName: receiptFile.name
        });
      };
      reader.readAsDataURL(receiptFile);
    } catch (error) {
      toast.error('خطأ في رفع الملف');
      setUploading(false);
    }
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
            <CardDescription>يجب تسجيل الدخول للوصول إلى صفحة الشحن</CardDescription>
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
            شحن الرصيد
          </h1>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* نموذج الشحن */}
          <div>
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-yellow-400">طلب شحن جديد</CardTitle>
                <CardDescription>اختر الباقة وارفع صورة إيصال الدفع</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* اختيار الباقة */}
                <div className="space-y-3">
                  <Label>اختر الباقة</Label>
                  <RadioGroup value={selectedPackage} onValueChange={(value: any) => setSelectedPackage(value)}>
                    <div className="flex items-center space-x-2 space-x-reverse p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                      <RadioGroupItem value="single" id="single" />
                      <Label htmlFor="single" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <span>لفة واحدة</span>
                          <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.SINGLE_SPIN)}$</span>
                        </div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2 space-x-reverse p-3 bg-gradient-to-br from-blue-900/50 to-purple-900/50 rounded-lg border border-blue-600">
                      <RadioGroupItem value="pack_10" id="pack_10" />
                      <Label htmlFor="pack_10" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold">10 لفات</span>
                            <span className="text-xs text-green-400 block">وفر {PRICING.PACK_10.savings}%</span>
                          </div>
                          <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_10.price)}$</span>
                        </div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2 space-x-reverse p-3 bg-gradient-to-br from-purple-900/50 to-pink-900/50 rounded-lg border border-purple-600">
                      <RadioGroupItem value="pack_50" id="pack_50" />
                      <Label htmlFor="pack_50" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold">50 لفة</span>
                            <span className="text-xs text-green-400 block">وفر {PRICING.PACK_50.savings}%</span>
                          </div>
                          <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_50.price)}$</span>
                        </div>
                      </Label>
                    </div>
                    
                    <div className="flex items-center space-x-2 space-x-reverse p-3 bg-gradient-to-br from-orange-900/50 to-red-900/50 rounded-lg border border-orange-600">
                      <RadioGroupItem value="pack_100" id="pack_100" />
                      <Label htmlFor="pack_100" className="flex-1 cursor-pointer">
                        <div className="flex justify-between items-center">
                          <div>
                            <span className="font-bold">100 لفة</span>
                            <span className="text-xs text-green-400 block">وفر {PRICING.PACK_100.savings}%</span>
                          </div>
                          <span className="text-yellow-400 font-bold">{centsToDollars(PRICING.PACK_100.price)}$</span>
                        </div>
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                
                {/* رفع الإيصال */}
                <div className="space-y-3">
                  <Label>صورة إيصال شام كاش</Label>
                  <div className="border-2 border-dashed border-gray-600 rounded-lg p-6 text-center">
                    {receiptFile ? (
                      <div className="space-y-3">
                        <img 
                          src={URL.createObjectURL(receiptFile)} 
                          alt="Receipt" 
                          className="max-h-48 mx-auto rounded"
                        />
                        <p className="text-sm text-gray-400">{receiptFile.name}</p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setReceiptFile(null)}
                        >
                          تغيير الصورة
                        </Button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-2" />
                        <p className="text-sm text-gray-400 mb-1">اضغط لرفع صورة الإيصال</p>
                        <p className="text-xs text-gray-500">PNG, JPG حتى 5MB</p>
                        <Input
                          type="file"
                          accept="image/*"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
                
                <Button
                  onClick={handleSubmit}
                  disabled={!receiptFile || uploading || createDepositMutation.isPending}
                  className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-gray-900 hover:from-yellow-500 hover:to-orange-600"
                  size="lg"
                >
                  {(uploading || createDepositMutation.isPending) ? (
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
                <CardTitle>طلباتي</CardTitle>
                <CardDescription>سجل طلبات الشحن</CardDescription>
              </CardHeader>
              <CardContent>
                {!pendingDeposits || pendingDeposits.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد طلبات</p>
                ) : (
                  <div className="space-y-3">
                    {pendingDeposits.map((deposit: any) => (
                      <div key={deposit.id} className="p-4 bg-gray-700/50 rounded-lg border border-gray-600">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold text-yellow-400">{centsToDollars(deposit.amount)}$</p>
                            <p className="text-sm text-gray-400">{deposit.spinsCount} لفة</p>
                          </div>
                          <div className="text-left">
                            {deposit.status === 'pending' && (
                              <span className="text-xs bg-yellow-600 px-2 py-1 rounded">قيد المراجعة</span>
                            )}
                            {deposit.status === 'approved' && (
                              <span className="text-xs bg-green-600 px-2 py-1 rounded flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" />
                                تمت الموافقة
                              </span>
                            )}
                            {deposit.status === 'rejected' && (
                              <span className="text-xs bg-red-600 px-2 py-1 rounded">مرفوض</span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-500">
                          {new Date(deposit.createdAt).toLocaleString('ar-EG')}
                        </p>
                        {deposit.reviewNotes && (
                          <p className="text-xs text-gray-400 mt-2 p-2 bg-gray-800 rounded">
                            ملاحظة: {deposit.reviewNotes}
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
