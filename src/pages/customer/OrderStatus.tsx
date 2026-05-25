import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { motion } from 'framer-motion';
import { 
  Clock, 
  ChefHat, 
  CheckCircle2, 
  Utensils, 
  ArrowLeft,
  Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function OrderStatus() {
  const { orderId } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) setOrder(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();

    // Establish real-time connection
    const socket = io();
    socket.emit('join-order', orderId);

    socket.on('order-status-updated', (data: { status: string }) => {
      setOrder((prev: any) => prev ? { ...prev, status: data.status } : null);
    });

    return () => {
      socket.off('order-status-updated');
      socket.disconnect();
    };
  }, [orderId]);

  if (loading) return null;
  if (!order) return <div className="p-8 text-center">Order not found</div>;

  const steps = [
    { status: 'PENDING', icon: Clock, label: 'Order Received' },
    { status: 'ACCEPTED', icon: ChefHat, label: 'Accepted' },
    { status: 'PREPARING', icon: Timer, label: 'Preparing' },
    { status: 'READY', icon: CheckCircle2, label: 'Ready to Serve' },
  ];

  const activeIndex = steps.findIndex(s => s.status === order.status);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white p-6 border-b border-slate-100 flex items-center justify-between">
        <Link to={`/menu/${order.tableNumber}`}>
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft size={20} />
          </Button>
        </Link>
        <h1 className="font-bold text-lg">Order Status</h1>
        <div className="w-10" />
      </header>

      <main className="p-6 flex-1 space-y-6">
        <Card className="rounded-[2rem] border-none shadow-sm overflow-hidden bg-white">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center space-y-4 mb-8">
              <div className="w-20 h-20 bg-slate-900 text-white rounded-3xl flex items-center justify-center shadow-2xl shadow-slate-900/20">
                <Utensils size={32} />
              </div>
              <div>
                <p className="text-slate-400 text-sm font-medium uppercase tracking-widest">Order #{order.id.slice(0, 5)}</p>
                <h2 className="text-2xl font-bold text-slate-900 mt-1">Status: {order.status}</h2>
              </div>
            </div>

            <div className="space-y-8 relative">
              <div className="absolute left-[19px] top-2 bottom-2 w-0.5 bg-slate-100" />
              {steps.map((step, idx) => {
                const isPast = idx < activeIndex;
                const isCurrent = idx === activeIndex;
                const Icon = step.icon;

                return (
                  <div key={step.status} className="flex items-center gap-6 relative z-10">
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500",
                      isPast ? "bg-emerald-500 text-white" : isCurrent ? "bg-slate-900 text-white scale-110" : "bg-white border-2 border-slate-100 text-slate-300"
                    )}>
                      <Icon size={18} />
                    </div>
                    <span className={cn(
                      "font-bold transition-all duration-500",
                      isPast ? "text-emerald-500" : isCurrent ? "text-slate-900 text-lg" : "text-slate-300"
                    )}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h3 className="font-bold text-slate-900 px-2">Order Summary</h3>
          {order.items?.map((item: any) => (
            <div key={item.id} className="bg-white p-4 rounded-2xl flex justify-between items-center shadow-sm">
              <span className="font-bold text-slate-700">{item.quantity}x {item.productName}</span>
              <span className="text-slate-400 text-sm">${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}