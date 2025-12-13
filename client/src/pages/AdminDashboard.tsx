import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Redirect } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { centsToDollars } from "@shared/constants";
import { Loader2, CheckCircle, XCircle, AlertTriangle, Users, TrendingUp, DollarSign } from "lucide-react";

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [selectedDeposit, setSelectedDeposit] = useState<any>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [transferRef, setTransferRef] = useState("");
  
  const { data: pendingDeposits, refetch: refetchDeposits } = trpc.deposit.getPending.useQuery();
  const { data: pendingWithdrawals, refetch: refetchWithdrawals } = trpc.withdrawal.getPending.useQuery();
  const { data: adminStats } = trpc.stats.admin.useQuery();
  
  const reviewDepositMutation = trpc.deposit.review.useMutation({
    onSuccess: () => {
      toast.success('تم مراجعة الطلب بنجاح');
      refetchDeposits();
      setSelectedDeposit(null);
      setReviewNotes("");
    },
    onError: (error) => {
      toast.error('خطأ', { description: error.message });
    }
  });
  
  const processWithdrawalMutation = trpc.withdrawal.process.useMutation({
    onSuccess: () => {
      toast.success('تم معالجة الطلب بنجاح');
      refetchWithdrawals();
      setSelectedWithdrawal(null);
      setReviewNotes("");
      setTransferRef("");
    },
    onError: (error) => {
      toast.error('خطأ', { description: error.message });
    }
  });
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin" />
      </div>
    );
  }
  
  if (!user || user.role !== 'admin') {
    return <Redirect to="/" />;
  }
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-gray-900 text-white">
      <header className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent">
            لوحة التحكم الإدارية
          </h1>
        </div>
      </header>
      
      <main className="container mx-auto px-4 py-8">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Users className="w-8 h-8 text-blue-400" />
                <div>
                  <p className="text-sm text-gray-400">اللاعبين النشطين</p>
                  <p className="text-2xl font-bold">{adminStats?.daily?.activePlayers || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-8 h-8 text-green-400" />
                <div>
                  <p className="text-sm text-gray-400">إجمالي اللفات</p>
                  <p className="text-2xl font-bold">{adminStats?.daily?.totalSpins || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <DollarSign className="w-8 h-8 text-yellow-400" />
                <div>
                  <p className="text-sm text-gray-400">الأرباح الموزعة</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {centsToDollars(adminStats?.daily?.totalWinnings || 0)}$
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-red-400" />
                <div>
                  <p className="text-sm text-gray-400">نشاط مشبوه</p>
                  <p className="text-2xl font-bold text-red-400">
                    {adminStats?.suspiciousActivities?.length || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        {/* Tabs */}
        <Tabs defaultValue="deposits" className="space-y-4">
          <TabsList className="bg-gray-800/50">
            <TabsTrigger value="deposits">
              طلبات الشحن ({pendingDeposits?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="withdrawals">
              طلبات السحب ({pendingWithdrawals?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="spins">
              سجل اللفات
            </TabsTrigger>
            <TabsTrigger value="suspicious">
              نشاط مشبوه
            </TabsTrigger>
          </TabsList>
          
          {/* Deposits Tab */}
          <TabsContent value="deposits">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle>طلبات الشحن المعلقة</CardTitle>
                <CardDescription>مراجعة وموافقة على طلبات شحن الرصيد</CardDescription>
              </CardHeader>
              <CardContent>
                {!pendingDeposits || pendingDeposits.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد طلبات معلقة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المستخدم</TableHead>
                        <TableHead>الباقة</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>اللفات</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الإيصال</TableHead>
                        <TableHead>الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingDeposits.map((deposit: any) => (
                        <TableRow key={deposit.id}>
                          <TableCell>{deposit.userId}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{deposit.packageType}</Badge>
                          </TableCell>
                          <TableCell className="text-yellow-400 font-bold">
                            {centsToDollars(deposit.amount)}$
                          </TableCell>
                          <TableCell>{deposit.spinsCount}</TableCell>
                          <TableCell className="text-sm text-gray-400">
                            {new Date(deposit.createdAt).toLocaleString('ar-EG')}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="link"
                              size="sm"
                              onClick={() => window.open(deposit.receiptUrl, '_blank')}
                            >
                              عرض الإيصال
                            </Button>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => setSelectedDeposit({ ...deposit, action: 'approve' })}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedDeposit({ ...deposit, action: 'reject' })}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Withdrawals Tab */}
          <TabsContent value="withdrawals">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle>طلبات السحب المعلقة</CardTitle>
                <CardDescription>معالجة طلبات سحب الأرباح</CardDescription>
              </CardHeader>
              <CardContent>
                {!pendingWithdrawals || pendingWithdrawals.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد طلبات معلقة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>المستخدم</TableHead>
                        <TableHead>المبلغ</TableHead>
                        <TableHead>حساب شام كاش</TableHead>
                        <TableHead>الاسم</TableHead>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingWithdrawals.map((withdrawal: any) => (
                        <TableRow key={withdrawal.id}>
                          <TableCell>{withdrawal.userId}</TableCell>
                          <TableCell className="text-yellow-400 font-bold">
                            {centsToDollars(withdrawal.amount)}$
                          </TableCell>
                          <TableCell>{withdrawal.shamCashAccount}</TableCell>
                          <TableCell>{withdrawal.shamCashName}</TableCell>
                          <TableCell className="text-sm text-gray-400">
                            {new Date(withdrawal.createdAt).toLocaleString('ar-EG')}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => setSelectedWithdrawal({ ...withdrawal, action: 'approve' })}
                              >
                                <CheckCircle className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setSelectedWithdrawal({ ...withdrawal, action: 'reject' })}
                              >
                                <XCircle className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Spins Tab */}
          <TabsContent value="spins">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle>سجل اللفات الأخيرة</CardTitle>
                <CardDescription>آخر 100 لفة في النظام</CardDescription>
              </CardHeader>
              <CardContent>
                {!adminStats?.recentSpins || adminStats.recentSpins.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد لفات بعد</p>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>المستخدم</TableHead>
                          <TableHead>النتيجة</TableHead>
                          <TableHead>المبلغ</TableHead>
                          <TableHead>IP</TableHead>
                          <TableHead>التاريخ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminStats.recentSpins.map((spin: any) => (
                          <TableRow key={spin.id}>
                            <TableCell>{spin.userId}</TableCell>
                            <TableCell>
                              <Badge variant={spin.result === 'loss' ? 'destructive' : 'default'}>
                                {spin.result}
                              </Badge>
                            </TableCell>
                            <TableCell className={spin.amount > 0 ? 'text-green-400' : 'text-gray-400'}>
                              {centsToDollars(spin.amount)}$
                            </TableCell>
                            <TableCell className="text-xs text-gray-500">{spin.ipAddress}</TableCell>
                            <TableCell className="text-sm text-gray-400">
                              {new Date(spin.createdAt).toLocaleString('ar-EG')}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* Suspicious Tab */}
          <TabsContent value="suspicious">
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader>
                <CardTitle className="text-red-400">نشاط مشبوه</CardTitle>
                <CardDescription>مراقبة الأنشطة غير الطبيعية</CardDescription>
              </CardHeader>
              <CardContent>
                {!adminStats?.suspiciousActivities || adminStats.suspiciousActivities.length === 0 ? (
                  <p className="text-center text-gray-400 py-8">لا توجد أنشطة مشبوهة</p>
                ) : (
                  <div className="space-y-4">
                    {adminStats.suspiciousActivities.map((activity: any) => (
                      <div key={activity.id} className="p-4 bg-red-900/20 border border-red-700 rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-bold">المستخدم: {activity.userId}</p>
                            <p className="text-sm text-gray-400">{activity.activityType}</p>
                          </div>
                          <Badge variant="destructive">مشبوه</Badge>
                        </div>
                        <p className="text-sm text-gray-300 mb-2">{activity.details}</p>
                        <div className="flex justify-between items-center text-xs text-gray-500">
                          <span>IP: {activity.ipAddress}</span>
                          <span>{new Date(activity.createdAt).toLocaleString('ar-EG')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
      
      {/* Deposit Review Dialog */}
      <Dialog open={!!selectedDeposit} onOpenChange={() => setSelectedDeposit(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {selectedDeposit?.action === 'approve' ? 'الموافقة على الطلب' : 'رفض الطلب'}
            </DialogTitle>
            <DialogDescription>
              المبلغ: {selectedDeposit && centsToDollars(selectedDeposit.amount)}$ | 
              اللفات: {selectedDeposit?.spinsCount}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <label className="text-sm text-gray-400 mb-2 block">ملاحظات (اختياري)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="أضف ملاحظات..."
                className="bg-gray-700 border-gray-600"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDeposit(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                reviewDepositMutation.mutate({
                  depositId: selectedDeposit.id,
                  action: selectedDeposit.action,
                  notes: reviewNotes
                });
              }}
              disabled={reviewDepositMutation.isPending}
              className={selectedDeposit?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {reviewDepositMutation.isPending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Withdrawal Process Dialog */}
      <Dialog open={!!selectedWithdrawal} onOpenChange={() => setSelectedWithdrawal(null)}>
        <DialogContent className="bg-gray-800 border-gray-700 text-white">
          <DialogHeader>
            <DialogTitle>
              {selectedWithdrawal?.action === 'approve' ? 'معالجة السحب' : 'رفض السحب'}
            </DialogTitle>
            <DialogDescription>
              المبلغ: {selectedWithdrawal && centsToDollars(selectedWithdrawal.amount)}$ | 
              الحساب: {selectedWithdrawal?.shamCashAccount}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedWithdrawal?.action === 'approve' && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">رقم التحويل</label>
                <input
                  type="text"
                  value={transferRef}
                  onChange={(e) => setTransferRef(e.target.value)}
                  placeholder="أدخل رقم التحويل..."
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md"
                />
              </div>
            )}
            
            <div>
              <label className="text-sm text-gray-400 mb-2 block">ملاحظات (اختياري)</label>
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="أضف ملاحظات..."
                className="bg-gray-700 border-gray-600"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedWithdrawal(null)}>
              إلغاء
            </Button>
            <Button
              onClick={() => {
                processWithdrawalMutation.mutate({
                  withdrawalId: selectedWithdrawal.id,
                  action: selectedWithdrawal.action,
                  notes: reviewNotes,
                  transferReference: transferRef
                });
              }}
              disabled={processWithdrawalMutation.isPending || (selectedWithdrawal?.action === 'approve' && !transferRef)}
              className={selectedWithdrawal?.action === 'approve' ? 'bg-green-600 hover:bg-green-700' : ''}
            >
              {processWithdrawalMutation.isPending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
              تأكيد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
