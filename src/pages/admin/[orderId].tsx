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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// Re-using status icons and colors
const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  ACCEPTED: 'bg-blue-100 text-blue-700 border-blue-200',
  PREPARING: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PAID: 'bg-purple-100 text-purple-700 border-purple-200',
  COMPLETED: 'bg-slate-100 text-slate-500 border-slate-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

const STATUS_ICONS: Record<string, any> = {
  PENDING: Clock,
  ACCEPTED: CheckCircle2,
  PREPARING: ChefHat,
  READY: AlertCircle,
  PAID: CheckCircle2,
  COMPLETED: Truck,
  CANCELLED: Ban,
};

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  status: string;
  prepTimeMinutes?: number;
  countdownStartedAt?: string;
  modifiers?: { name: string; price: number }[];
  estimatedCompletionTime?: string;
}

interface Order {
  id: string;
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
    if (!item.estimatedCompletionTime || !item.countdownStartedAt || !item.prepTimeMinutes) return;

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

    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [item.estimatedCompletionTime, item.countdownStartedAt, item.prepTimeMinutes, item.status]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const colorClass =
    timeLeft > 300
      ? 'text-emerald-500'
      : timeLeft > 0
        ? 'text-amber-500'
        : 'text-rose-500 animate-pulse';
  const Icon = STATUS_ICONS[item.status] || Hourglass;

  if (item.status === 'READY' || item.status === 'COMPLETED') {
    return (
      <div className="flex items-center gap-2 text-emerald-600">
        <CheckCircle2 size={16} />
        <span className="font-bold text-sm">Ready</span>
      </div>
    );
  }

  if (
    item.prepTimeMinutes &&
    item.countdownStartedAt &&
    item.estimatedCompletionTime &&
    (item.status === 'ACCEPTED' || item.status === 'PREPARING')
  ) {
    return (
      <div className="w-full">
        <div className="flex items-center gap-2">
          <TimerIcon size={14} className={cn('text-slate-500', timeLeft <= 0 && 'text-rose-500')} />
          <span className={cn('font-mono font-bold text-sm', colorClass)}>
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

  // Persist socket connection
  const socket = useMemo<Socket>(() => io(), []);

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error(`Order not found or API error: ${res.statusText}`);
      const data: Order = await res.json();
      setOrder(data);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch order details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!orderId) return;

    fetchOrder();
    socket.emit('join-order', orderId);

    const onStatusUpdated = (data: { status: string }) => {
      setOrder((prev) => (prev ? { ...prev, status: data.status } : null));
    };

    const onTimerStarted = (data: {
      orderId: string;
      kotId: string;
      estimatedReadyTime: string;
      tableNumber: string;
    }) => {
      if (data.orderId === orderId) fetchOrder();
    };

    socket.on('order-status-updated', onStatusUpdated);
    socket.on('timer-started', onTimerStarted);

    return () => {
      socket.off('order-status-updated', onStatusUpdated);
      socket.off('timer-started', onTimerStarted);
      socket.disconnect();
    };
  }, [orderId, socket]);

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
                <Badge
                  className={cn('text-xs font-bold uppercase mt-1', STATUS_COLORS[order.status])}
                >
                  {order.status.replace('_', ' ')}
                </Badge>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-500">Total</p>
              <p className="text-xl font-bold text-slate-900">${order.totalAmount.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Items</h3>
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="p-4 rounded-2xl border border-slate-100 bg-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-900">{item.productName}</p>
                      {item.modifiers && item.modifiers.length > 0 && (
                        <span className="block text-[10px] text-slate-500 italic">
                          ({item.modifiers.map((mod: any) => mod.name).join(', ')})
                        </span>
                      )}
                      <p className="text-sm text-slate-500">Qty: {item.quantity}</p>
                    </div>
                    <div className="min-w-[160px]">
                      <ItemCountdownDisplay item={item} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
