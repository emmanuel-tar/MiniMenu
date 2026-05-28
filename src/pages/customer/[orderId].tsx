import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Ban,
  Coffee,
  Hourglass,
  Timer as TimerIcon,
  CreditCard,
  Banknote,
  Building,
  Download,
  Share2,
  CheckCircle,
  Star,
  BellRing,
  Receipt
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Re-using status icons and colors
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  ACCEPTED: "bg-blue-100 text-blue-700 border-blue-200",
  PREPARING: "bg-indigo-100 text-indigo-700 border-indigo-200",
  READY: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PAID: "bg-purple-100 text-purple-700 border-purple-200",
  PAYMENT_SUBMITTED: "bg-blue-100 text-blue-700 border-blue-200",
  AWAITING_PAYMENT: "bg-rose-100 text-rose-700 border-rose-200",
  COMPLETED: "bg-slate-100 text-slate-500 border-slate-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_ICONS: Record<string, any> = {
  PENDING: Clock,
  ACCEPTED: CheckCircle2,
  PREPARING: ChefHat,
  READY: AlertCircle,
  PAID: CheckCircle2,
  PAYMENT_SUBMITTED: Hourglass,
  AWAITING_PAYMENT: Clock,
  COMPLETED: Truck,
  CANCELLED: Ban,
};

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  status: string;
  prepTimeMinutes?: number;
  price: number;
  countdownStartedAt?: string;
  estimatedCompletionTime?: string;
}

interface Order {
  id: string;
  tableId?: string;
  tableNumber: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItem[];
}

const ItemCountdownDisplay = ({ item }: { item: OrderItem }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    if (!item.estimatedCompletionTime || !item.countdownStartedAt || !item.prepTimeMinutes) {
      return;
    }

    const totalPrepTimeMs = item.prepTimeMinutes * 60 * 1000;
    const startTimeMs = new Date(item.countdownStartedAt).getTime();
    const estimatedCompletionTimeMs = new Date(item.estimatedCompletionTime).getTime();

    const calculate = () => {
      const now = new Date().getTime();
      const diff = estimatedCompletionTimeMs - now;
      const elapsed = now - startTimeMs;

      setTimeLeft(Math.max(0, Math.floor(diff / 1000)));

      if (totalPrepTimeMs > 0) {
        const calculatedProgress = (elapsed / totalPrepTimeMs) * 100;
        setProgress(Math.min(100, Math.max(0, calculatedProgress)));
      } else {
        setProgress(item.status === 'READY' ? 100 : 0);
      }
    };

    calculate(); // Initial calculation
    const timer = setInterval(calculate, 1000);

    return () => clearInterval(timer);
  }, [item.estimatedCompletionTime, item.countdownStartedAt, item.prepTimeMinutes, item.status]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const colorClass = timeLeft > 300 ? "text-emerald-500" : timeLeft > 0 ? "text-amber-500" : "text-rose-500 animate-pulse";
  const Icon = STATUS_ICONS[item.status] || Hourglass;

  if (item.status === 'READY' || item.status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2 size={16} />
        <span className="font-bold text-sm">Ready</span>
      </div>
    );
  }

  if (item.prepTimeMinutes && item.countdownStartedAt && item.estimatedCompletionTime && (item.status === 'ACCEPTED' || item.status === 'PREPARING')) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-2">
          <TimerIcon size={14} className={cn("text-slate-500", timeLeft <= 0 && "text-rose-500")} />
          <span className={cn("font-mono font-bold text-sm", colorClass)}>
            {timeLeft > 0 ? `${mins}m ${secs}s left` : 'Delayed'}
          </span>
        </div>
        <Progress value={progress} className="h-1.5 mt-1" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-slate-500 text-sm">
      <Icon size={14} />
      <span className="capitalize">{item.status.toLowerCase()}</span>
    </div>
  );
};

export default function TrackOrder() {
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState<any>(null);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [isInvoiceVisible, setIsInvoiceVisible] = useState(false);
  const [feedback, setFeedback] = useState({ rating: 0, comment: '' });
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [isCallStaffDialogOpen, setIsCallStaffDialogOpen] = useState(false);
  const [callReason, setCallReason] = useState('Assistance');

  const handleFeedbackSubmit = async () => {
    await fetch(`/api/orders/${orderId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback)
    });
    setFeedbackSubmitted(true);
    toast.success("Thank you for your feedback!");
  };

  const handleCallStaff = () => {
    if (!order?.tableId) {
      toast.error("Table information missing. Cannot call staff.");
      return;
    }
    socket.emit("call-waiter", {
      tableId: order.tableId,
      tableName: order.tableNumber || 'Walk-in',
      reason: callReason
    });
    setIsCallStaffDialogOpen(false);
    toast.success("Staff has been notified. They will be with you shortly.");
  };

  const handleRequestBill = () => {
    if (!order) return;
    socket.emit("request-bill", { orderId: order.id });
    toast.success("Bill request sent. A waiter will bring your invoice shortly.");
  };

  // Persist socket connection
  const socket = useMemo<Socket>(() => io(), []);

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) {
        throw new Error(`Order not found or API error: ${res.statusText}`);
      }
      const data: Order = await res.json();
      setOrder(data);

      const compRes = await fetch('/api/company');
      if (compRes.ok) setCompany(await compRes.json());

    } catch (err: any) {
      setError(err.message || 'Failed to fetch order details.');
      console.error('Error fetching order:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      socket.emit("join-order", orderId);

      socket.on("order-status-updated", (data: { status: string }) => {
        setOrder(prev => prev ? { ...prev, status: data.status } : null);
        if (data.status === 'PAID') {
          setIsInvoiceVisible(true);
          fetchOrder(); // Refresh for latest price snapshot
        }
      });

      // Listen for timer updates for individual KOTs/items
      socket.on("timer-started", (data: { orderId: string }) => {
        if (data.orderId === orderId) {
          fetchOrder(); // Refetch to get updated item-level timing data
        }
      });

      return () => {
        socket.off("order-status-updated");
        socket.off("timer-started");
        socket.disconnect(); // Disconnect when component unmounts
      };
    }
  }, [orderId, socket]);

  // Calculate additive taxes and service charges
  const subtotal = order?.totalAmount || 0;
  const taxRate = company?.taxRate || 0;
  const serviceChargeRate = company?.enableServiceCharge ? (company?.serviceChargeRate || 0) : 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const serviceChargeAmount = (subtotal * serviceChargeRate) / 100;
  const grandTotal = subtotal + taxAmount + serviceChargeAmount;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <p className="text-xl text-slate-600 animate-pulse">Loading your order...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-rose-50 text-rose-700 p-4 text-center">
        <AlertCircle size={48} className="mb-4" />
        <h1 className="text-2xl font-bold mb-2">Order Not Found</h1>
        <p className="text-lg">{error || 'Please check your order link.'}</p>
      </div>
    );
  }

  const overallStatusIcon = STATUS_ICONS[order.status] || Clock;

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 md:p-8 flex flex-col items-center">
      <Card className="max-w-2xl w-full rounded-3xl shadow-xl border-none">
        <CardHeader className="text-center bg-slate-900 text-white rounded-t-3xl py-8">
          <CardTitle className="text-3xl font-bold flex items-center justify-center gap-3">
            <Coffee size={32} /> Your Order
          </CardTitle>
          <CardDescription className="text-slate-300 mt-2">
            Tracking for Table {order.tableNumber || 'WALK-IN'} - Order #{order.id.slice(0, 8)}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg text-slate-600">
                {React.createElement(overallStatusIcon, { size: 24 })}
              </div>
              <div>
                <p className="font-bold text-xl text-slate-900">Order Status</p>
                <div className="flex flex-col gap-2 mt-1">
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-xs font-bold uppercase", STATUS_COLORS[order.status])}>
                      {order.status.replace('_', ' ')}
                    </Badge>
                  </div>
                  {order.status !== 'PAID' && order.status !== 'COMPLETED' && order.status !== 'CANCELLED' && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-[10px] gap-1.5 border-slate-200 text-slate-600 hover:bg-slate-50 flex-1"
                        onClick={() => setIsCallStaffDialogOpen(true)}
                      >
                        <BellRing size={12} /> Call Staff
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="h-7 text-[10px] gap-1.5 border-emerald-200 text-emerald-600 hover:bg-emerald-50 flex-1"
                        onClick={handleRequestBill}
                      >
                        <Receipt size={12} /> Request Bill
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-xl font-bold text-slate-900">
                {company?.currency || 'NGN'}{grandTotal.toLocaleString()}
              </p>
              {company?.secondaryCurrency && company?.exchangeRate && (
                <p className="text-xs text-slate-400 italic">({company.secondaryCurrency}{(grandTotal * company.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })})</p>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            <h4 className="font-bold text-slate-900">Order Items</h4>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-800">{item.quantity}x {item.productName}</span>
                    <ItemCountdownDisplay item={item} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {!feedbackSubmitted && order.status === 'PAID' && (
            <div className="mt-8 pt-8 border-t border-slate-100">
              <p className="font-bold text-slate-900 mb-4 text-center">How was your experience?</p>
              <div className="flex justify-center gap-2 mb-4">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setFeedback({ ...feedback, rating: star })}
                    className={cn("p-1", feedback.rating >= star ? "text-amber-400" : "text-slate-200")}
                  >
                    <Star size={32} fill={feedback.rating >= star ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <Input
                placeholder="Any comments or staff mentions?"
                className="rounded-xl mb-4"
                value={feedback.comment}
                onChange={e => setFeedback({ ...feedback, comment: e.target.value })}
              />
              <Button className="w-full bg-slate-900 rounded-xl" onClick={handleFeedbackSubmit} disabled={feedback.rating === 0}>
                Submit Feedback
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={(order.status === 'AWAITING_PAYMENT' || order.status === 'PAYMENT_SUBMITTED') && !isInvoiceVisible} onOpenChange={() => {}}>
        <DialogContent className="rounded-3xl border-none max-w-sm" onPointerDownOutside={(e: any) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">{order.status === 'PAYMENT_SUBMITTED' ? 'Verifying Payment' : 'Request Payment'}</DialogTitle>
            <DialogDescription>{order.status === 'PAYMENT_SUBMITTED' ? 'The cashier is currently verifying your transaction.' : 'Please select your preferred payment method'}</DialogDescription>
          </DialogHeader>
          {order.status !== 'PAYMENT_SUBMITTED' && <div className="grid grid-cols-2 gap-3 py-4">
            {[
              { id: 'CASH', icon: Banknote, label: 'Cash' },
              { id: 'POS', icon: CreditCard, label: 'ATM Card' },
              { id: 'TRANSFER', icon: Building, label: 'Transfer' },
            ].map((m) => (
              <Button
                key={m.id}
                variant={selectedMethod === m.id ? 'default' : 'outline'}
                className={cn("h-20 flex flex-col gap-2 rounded-2xl", selectedMethod === m.id && "bg-slate-900")}
                onClick={() => setSelectedMethod(m.id)}
              >
                <m.icon size={24} />
                <span className="font-bold">{m.label}</span>
              </Button>
            ))}
          </div>}

          {selectedMethod && order.status !== 'PAYMENT_SUBMITTED' && (
            <div className="space-y-3 mb-4">
              <Label className="text-xs">Transaction Reference / Note (Optional)</Label>
              <Input 
                placeholder="e.g. Last 4 digits or Bank Name" 
                value={reference} 
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReference(e.target.value)}
                className="rounded-xl"
              />
            </div>
          )}

          {selectedMethod === 'TRANSFER' && company && order.status !== 'PAYMENT_SUBMITTED' && (
            <div className="p-4 bg-slate-50 rounded-2xl space-y-2 border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-400">Account Details</p>
              <div className="font-mono text-sm">
                <p className="font-bold text-slate-900">{company.bankName}</p>
                <p className="text-lg font-bold text-slate-900">{company.accountNumber}</p>
                <p className="text-slate-600">{company.accountName}</p>
              </div>
            </div>
          )}

          {order.status === 'PAYMENT_SUBMITTED' ? (
            <div className="py-8 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center animate-pulse">
                <Clock size={32} />
              </div>
              <p className="font-medium text-slate-600 italic">Receipt will print automatically once verified.</p>
            </div>
          ) : (
            <Button 
              className="w-full h-12 rounded-xl bg-slate-900 font-bold"
              disabled={!selectedMethod}
              onClick={async () => {
                socket.emit("payment-method-selected", { orderId: order.id, method: selectedMethod });
                toast.success("Payment submitted for verification");
              }}
            >
              {selectedMethod === 'TRANSFER' ? 'I Have Made the Transfer' : 'Confirm Payment Selection'}
            </Button>
          )}
        </DialogContent>
      </Dialog>

      {/* Digital Invoice Modal */}
      <Dialog open={isInvoiceVisible} onOpenChange={setIsInvoiceVisible}>
        <DialogContent className="rounded-3xl border-none max-w-md p-0 overflow-hidden">
          <div className="bg-emerald-600 p-8 text-center text-white">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
              {company?.receiptSettings?.showLogo && company?.logo ? (
                <img src={company.logo} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <CheckCircle size={40} />
              )}
            </div>
              <CheckCircle size={40} />
            </div>
            <h2 className="text-2xl font-bold">Payment Successful</h2>
            <p className="opacity-80">Thank you for your patronage!</p>
          </div>
          
          <div className="p-6 bg-white">
            <div className="border-2 border-dashed border-slate-100 rounded-2xl p-4 mb-6">
              <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                {company?.receiptSettings?.showLogo && company?.logo ? (
                  <img src={company.logo} alt="Logo" className="max-w-[80px] mb-2" />
                ) : (
                  // Optionally display company name if no logo
                  <span className="text-lg font-bold text-slate-900">{company?.name}</span>
                )}
                <span>Invoice #{order.id.slice(0, 8)}</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <span className="text-slate-600">{item.quantity}x {item.productName}</span>
                    <span className="font-bold text-slate-900">{company?.currency}{item.price.toLocaleString()}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Subtotal</span>
                  <span>{company?.currency}{subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                {company?.receiptSettings?.showTax && taxAmount > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>VAT ({taxRate}%)</span>
                    <span>{company?.currency}{taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                {serviceChargeAmount > 0 && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Service Charge ({serviceChargeRate}%)</span>
                    <span>{company?.currency}{serviceChargeAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold text-slate-900 pt-2">
                  <span>Total Paid</span>
                  <span>{company?.currency}{grandTotal.toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="text-center text-xs text-slate-500 mt-4">
              {company?.receiptSettings?.footerText || 'Thank you for your visit!'}
              {company?.address && <p className="mt-1">{company.address}</p>}
              {company?.phone && <p>{company.phone}</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="rounded-xl h-12 gap-2 border-slate-200"
                onClick={() => window.print()}
              >
                <Download size={18} /> Save PDF
              </Button>
              <Button 
                variant="outline" 
                className="rounded-xl h-12 gap-2 border-slate-200"
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `Invoice from ${company?.name}`,
                      text: `My receipt for Table ${order.tableNumber}`,
                      url: window.location.href
                    });
                  }
                }}
              >
                <Share2 size={18} /> Share
              </Button>
            </div>
            <Button className="w-full mt-3 h-12 rounded-xl bg-slate-900 font-bold" onClick={() => setIsInvoiceVisible(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}