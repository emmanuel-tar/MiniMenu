import React, { useState, useEffect, useMemo, ChangeEvent } from 'react';
import { io } from 'socket.io-client';

import { 
  ClipboardList,
  Search,
  ChefHat,
  Clock,
  CheckCircle2,
  AlertCircle,
  Truck,
  Ban,
  List,
   Printer,
  Timer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow,
  TableFooter
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter 
} from '@/components/ui/dialog';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/src/lib/utils';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  ACCEPTED: "bg-blue-100 text-blue-700 border-blue-200",
  PREPARING: "bg-indigo-100 text-indigo-700 border-indigo-200",
  READY: "bg-emerald-100 text-emerald-700 border-emerald-200",
  PAID: "bg-purple-100 text-purple-700 border-purple-200",
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
  AWAITING_PAYMENT: Clock,
  COMPLETED: Truck,
  CANCELLED: Ban,
};

const CountdownDisplay = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const calculate = () => {
      const diff = new Date(targetDate).getTime() - new Date().getTime();
      setTimeLeft(Math.max(0, Math.floor(diff / 1000)));
    };
    calculate();
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  // Implementation of om32: Color System
  const colorClass = timeLeft > 300 
    ? "text-emerald-500" // On Time
    : timeLeft > 0 
      ? "text-amber-500 animate-pulse" // Near Due
      : "text-rose-500 animate-bounce"; // Delayed

  return <span className={cn("font-mono font-bold", colorClass)}>{mins}m {secs}s</span>;
};

export default function Orders() {
  const { token } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [kots, setKots] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  // Persist socket connection
  const socket = useMemo(() => io(), []);

  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isTimerDialogOpen, setIsTimerDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [selectedKot, setSelectedKot] = useState<any>(null);
  const [prepTime, setPrepTime] = useState("15");
  const [orderToCancel, setOrderToCancel] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [company, setCompany] = useState<any>(null);
  const [receiptSettings, setReceiptSettings] = useState<any>(null);

  const formatPrice = (amount: number) => {
    const primary = `${company?.currency || 'NGN'}${amount.toLocaleString()}`;
    if (company?.secondaryCurrency && company?.exchangeRate) {
      const secondary = `${company.secondaryCurrency}${(amount * company.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
      return <span className="flex flex-col items-end"><span>{primary}</span><span className="text-[10px] opacity-40">({secondary})</span></span>;
    }
    return primary;
  };

  const fetchData = async () => {
    try {
      const authHeader = { 'Authorization': `Bearer ${token}` };
      const [ordersRes, kotsRes, stationsRes] = await Promise.all([
        fetch('/api/admin/orders', { headers: authHeader }),
        fetch('/api/admin/kots', { headers: authHeader }),
        fetch('/api/stations', { headers: authHeader })
      ]);

      const compRes = await fetch('/api/company');
      const setRes = await fetch('/api/settings/receipt');
      if (compRes.ok) setCompany(await compRes.json());
      if (setRes.ok) setReceiptSettings(await setRes.json());

      if (ordersRes.ok && kotsRes.ok && stationsRes.ok) {
        const ordersData = await ordersRes.json();
        const kotsData = await kotsRes.json();
        const stationsData = await stationsRes.json();

        setOrders(ordersData.sort((a: any, b: any) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ));
        setKots(kotsData);
        setStations(stationsData);
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchData();

      // Audio notification for new kitchen orders
      const orderSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      orderSound.volume = 0.5;

      // Audio notification for paid orders (Cash Register sound)
      const cashRegisterSound = new Audio('https://assets.mixkit.co/active_storage/sfx/107/107-preview.mp3'); // Example cash register sound
      cashRegisterSound.volume = 0.6;



      socket.on("new-order-received", (order: any) => {
        orderSound.play().catch(error => console.log("Audio playback failed (interaction required):", error));
        toast.success(`🔔 New Order Received!`, {
          description: `Table ${order.tableNumber} - $${(order.totalAmount || 0).toFixed(2)}`,
        });
        fetchData(); // Refresh list immediately to show the new order in Kitchen View
      });

      socket.on("timer-started", (data: any) => {
        toast.info(`Timer started for Table ${data.tableNumber}`);
        fetchData();
      });

      socket.on("order-paid", (data: { orderId: string, tableNumber: string }) => {
        cashRegisterSound.play().catch(error => console.log("Audio playback failed:", error));
        toast.success(`Order Paid: Table ${data.tableNumber}`);
      });

      const interval = setInterval(fetchData, 10000);
      return () => {
        clearInterval(interval);
        socket.off("new-order-received");
      };
    }
  }, [token, socket]);

  const handleCancelOrder = async () => {
    if (!orderToCancel) return;
    await updateStatus(orderToCancel.id, 'CANCELLED');
    setIsCancelDialogOpen(false);
    setOrderToCancel(null);
  };

  const handleProcessPayment = async () => {
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/pay`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ method: paymentMethod }),
      });
      if (res.ok) {
        toast.success('Payment recorded');
        setIsBillingOpen(false);
        fetchData();
      }
    } catch (err) {
      toast.error('Payment processing failed');
    }
  };

  const handlePrintReceipt = (order: any) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return;

    const subtotal = order.totalAmount;
    const taxRate = company?.taxRate || 0;
    const serviceRate = company?.enableServiceCharge ? (company?.serviceChargeRate || 0) : 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const serviceChargeAmount = (subtotal * serviceRate) / 100;
    const grandTotal = subtotal + taxAmount + serviceChargeAmount;

    const primaryCurrency = company?.currency || 'NGN';
    const secondaryCurrency = company?.secondaryCurrency;
    const exchangeRate = company?.exchangeRate;

    const itemsHtml = order.items.map((i: any) => `
      <div style="display: flex; justify-content: space-between; font-size: 14px; margin-bottom: 4px;">
        <span>${i.quantity}x ${i.productName}</span>
        <span>${primaryCurrency}${(i.price * i.quantity).toLocaleString()}</span>
      </div>
    `).join('');

    const showLogo = receiptSettings?.showLogo && company?.logo;
    const showTax = receiptSettings?.showTax;
    const showSecondaryCurrency = secondaryCurrency && exchangeRate;
    const footerText = receiptSettings?.footerText;

    printWindow.document.write(`
      <html>
        <head>
          <style>
            body { font-family: monospace; padding: 20px; width: 300px; margin: 0 auto; color: #000; }
            .header { text-align: center; margin-bottom: 15px; }
            .logo { max-width: 120px; height: auto; margin-bottom: 10px; }
            .items { margin: 10px 0; }
            .breakdown { font-size: 13px; margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; margin-bottom: 5px; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; }
            .total { display: flex; justify-content: space-between; font-weight: bold; margin-top: 10px; border-top: 1px dashed #000; padding-top: 10px; font-size: 16px; }
            .footer { text-align: center; margin-top: 25px; font-size: 12px; border-top: 1px dashed #000; padding-top: 10px; }
            hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="header">
            ${showLogo ? `<img src="${company.logo}" class="logo" />` : ''}
            <h2 style="margin: 0; font-size: 18px;">${company?.name || 'Restaurant'}</h2>
            <p style="margin: 5px 0; font-size: 14px;">Table: ${order.tableNumber || 'Walk-in'}</p>
            <p style="margin: 2px 0; font-size: 12px; opacity: 0.7;">Order: #${order.id.slice(0, 8)}</p>
          </div>
          <hr/>
          <div class="items">${itemsHtml}</div>          
          <div class="breakdown">
            <div class="row"><span>Subtotal</span><span>${primaryCurrency}${subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span></div>
            ${showTax ? `
            <div class="row">
              <span>VAT (${taxRate}%)</span>
              <span>${primaryCurrency}${taxAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>` : ''}
            ${serviceChargeAmount > 0 ? `
            <div className="row">
              <span>Service Charge (${serviceRate}%)</span>
              <span>${primaryCurrency}${serviceChargeAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
            </div>` : ''}
          </div>
          <div class="total">
            <span>Total</span>
            <span>${primaryCurrency}${grandTotal.toLocaleString()}</span>
          </div>
          ${showSecondaryCurrency ? `
          <div class="total" style="font-size: 14px; font-weight: normal; border-top: none; padding-top: 0;">
            <span></span>
            <span>(${secondaryCurrency}${(grandTotal * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2 })})</span>
          </div>` : ''}
          </div>
          <div class="footer">${footerText || 'Thank you for dining with us!'}</div>
          <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 100); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleMarkItemServed = async (itemId: string) => {
    try {
      const res = await fetch(`/api/admin/orders/items/${itemId}/served`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Item marked as served');
        fetchData();
      }
    } catch (err) { toast.error('Connection error'); }
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`Order status updated`);
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const updateKotStatus = async (kotId: string, newStatus: string, time?: number) => {
    try {
      const res = await fetch(`/api/admin/kots/${kotId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status: newStatus, prepTimeMinutes: time }),
      });
      if (res.ok) {
        toast.success(`KOT status updated`);
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to update KOT status');
    }
  };

  const toggleOrderExpansion = (orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const handleReprintKot = async (kotId: string) => {
    try {
      const res = await fetch(`/api/admin/kots/${kotId}/reprint`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Reprint request sent');
      } else {
        const err = await res.json();
        toast.error(err.error || 'Reprint failed');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const handleRejectKot = async () => {
    if (!rejectionReason) return toast.error("Reason required");
    try {
      await updateKotStatus(selectedKot.id, 'REJECTED', undefined);
      setIsRejectDialogOpen(false);
      setRejectionReason("");
      setSelectedKot(null);
    } catch (err) {
      toast.error('Rejection failed');
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order: any) => {
      const matchesSearch = order.id.toLowerCase().includes(search.toLowerCase()) || 
                           order.tableNumber?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, search, statusFilter]);

  const filteredKots = useMemo(() => {
    return kots.filter((kot: any) => {
      const matchesStation = stationFilter === 'ALL' || kot.stationId === stationFilter;
      const isActive = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(kot.status);
      return matchesStation && isActive;
    });
  }, [kots, stationFilter]);

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <ClipboardList className="text-slate-400" size={32} />
            Order Management
          </h2>
          <p className="text-slate-500">Monitor and update order statuses in real-time</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <TabsList className="bg-slate-100/50 p-1 rounded-xl">
            <TabsTrigger value="all" className="rounded-lg gap-2">
              <List size={16} /> All Orders
            </TabsTrigger>
            <TabsTrigger value="kitchen" className="rounded-lg gap-2">
              <ChefHat size={16} /> Kitchen View
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-3">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input 
                placeholder="Search order or table..." 
                className="pl-9 rounded-xl border-slate-200 bg-white"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            {activeTab === 'all' ? (
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v || 'ALL')}>
                <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white"> {/* This is the line at 351:44 */}
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="PREPARING">Preparing</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="AWAITING_PAYMENT">Awaiting Payment</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={stationFilter} onValueChange={(v) => setStationFilter(v || 'ALL')}> {/* Handle null explicitly */}
                <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white">
                  <SelectValue placeholder="Station" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Stations</SelectItem>
                  {stations.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <TabsContent value="all" className="mt-0">
          <Card className="rounded-3xl border-none shadow-sm overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow className="border-slate-100 hover:bg-transparent">
                    <TableHead className="font-semibold text-slate-600">Order</TableHead>
                    <TableHead className="font-semibold text-slate-600">Table</TableHead>
                    <TableHead className="font-semibold text-slate-600">Status</TableHead>
                    <TableHead className="font-semibold text-slate-600">Items</TableHead>
                    <TableHead className="font-semibold text-slate-600">Time</TableHead>
                    <TableHead className="font-semibold text-slate-600 text-right">Total</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order: any) => (
                    <TableRow key={order.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <TableCell>
                        <span className="font-bold text-slate-900 leading-none">#{order.id.slice(0, 5)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-slate-100 text-slate-700 border-none font-bold">
                          T-{order.tableNumber || 'WALK'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={order.status} onValueChange={(val) => updateStatus(order.id, val)}>
                          <SelectTrigger className={cn(
                            "h-8 w-32 border font-bold text-[10px] uppercase rounded-lg",
                            STATUS_COLORS[order.status]
                          )}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PENDING">Pending</SelectItem>
                            <SelectItem value="ACCEPTED">Accepted</SelectItem>
                            <SelectItem value="PREPARING">Preparing</SelectItem>
                            <SelectItem value="READY">Ready</SelectItem>
                            <SelectItem value="PAID">Paid</SelectItem>
                            <SelectItem value="AWAITING_PAYMENT">Awaiting Payment</SelectItem>
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {(expandedOrders.has(order.id) ? order.items : order.items?.slice(0, 5))?.map((item: any) => (
                            <div key={item.id} className="flex items-center justify-between group/item gap-2">
                              <span className="text-xs text-slate-600 truncate">
                                {item.quantity}x {item.productName}
                                {item.modifiers && item.modifiers.length > 0 && (
                                  <span className="block text-[10px] text-slate-400 italic">
                                    ({item.modifiers.map((mod: any) => mod.name).join(', ')})
                                  </span>
                                )}
                                {item.notes && (
                                  <span className="block text-[10px] text-amber-600 font-medium">
                                    Note: {item.notes}
                                  </span>
                                )}
                              </span>
                              {item.kotId && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-5 w-5 opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-slate-100 rounded-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReprintKot(item.kotId);
                                  }}
                                  title="Reprint KOT"
                                >
                                  <Printer size={10} />
                                </Button>
                              )}
                            </div>
                          ))}
                          {order.items.length > 5 && (
                            <button 
                              className="text-[10px] text-slate-400 font-medium italic hover:text-slate-600 transition-colors w-fit text-left outline-none"
                              onClick={() => toggleOrderExpansion(order.id)}
                            >
                              {expandedOrders.has(order.id) ? "Show less" : `+ ${order.items.length - 5} more items`}
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        {formatPrice(order.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {order.status === 'READY' && (
                            <Button 
                              size="sm" 
                              className="h-8 rounded-lg bg-rose-600 hover:bg-rose-700 text-[10px] font-bold"
                              onClick={() => updateStatus(order.id, 'AWAITING_PAYMENT')}
                            >
                              Request Payment
                            </Button>
                          )}
                          {(order.status === 'READY' || order.status === 'AWAITING_PAYMENT') && (
                            <Button 
                              size="sm" 
                              className="h-8 rounded-lg bg-slate-900 text-[10px] font-bold"
                              onClick={() => { setSelectedOrder(order); setIsBillingOpen(true); }}
                            >
                              Bill Order
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => handlePrintReceipt(order)}
                          >
                            <Printer size={14} />
                          </Button>
                          {!['CANCELLED', 'COMPLETED', 'PAID'].includes(order.status) && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => toast.info('Table Transfer functionality coming in next phase')}
                            >
                              <Truck size={14} />
                            </Button>
                          )}
                          {!['CANCELLED', 'COMPLETED', 'PAID'].includes(order.status) && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                              onClick={() => { setOrderToCancel(order); setIsCancelDialogOpen(true); }}
                            >
                              <Ban size={14} />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredOrders.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-24">
                        <div className="flex flex-col items-center opacity-20 text-slate-400">
                          <ClipboardList size={64} />
                          <p className="mt-4 font-mono font-bold uppercase">No orders found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kitchen" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredKots.map((kot: any) => {
              const Icon = STATUS_ICONS[kot.status] || Clock;
              return (
                <Card key={kot.id} className={cn(
                  "border-none shadow-sm rounded-3xl overflow-hidden flex flex-col",
                  kot.status === 'READY' ? "ring-2 ring-emerald-500" : ""
                )}>
                  <div className={cn(
                    "p-4 flex items-center justify-between",
                    STATUS_COLORS[kot.status]
                  )}>
                    <div className="flex items-center gap-2">
                       <Icon size={16} />
                       <span className="font-bold text-[10px] uppercase tracking-wider">{kot.status}</span>
                    </div>
                    <span className="font-mono text-[10px] font-bold opacity-60">
                      {kot.station?.name}
                    </span>
                  </div>
                  <CardHeader className="py-4 px-6 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl font-bold">T-{kot.order?.tableNumber || 'WALK'}</CardTitle>
                      <CardDescription className="text-[10px] font-mono flex items-center gap-1 mt-1">
                        <Clock size={10} />
                        Ordered: {new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </CardDescription>
                      {kot.estimatedReadyTime && kot.status !== 'COMPLETED' && (
                        <div className="mt-2 flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <Timer size={14} className="text-slate-400" />
                          <div className="flex flex-col">
                             <CountdownDisplay targetDate={kot.estimatedReadyTime} />
                          </div>
                        </div>
                      )}
                    </div>
                    <Badge className="bg-slate-900/10 text-slate-900 border-none px-3 py-1 rounded-full text-xs font-bold">
                      ORD #{kot.order?.id?.slice(0, 4)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="px-6 pb-6 space-y-4 flex-1">
                    <div className="space-y-2">
                      {kot.items.map((item: any) => (
                        <div key={item.id} className="flex items-start gap-3 group">
                          <div className="w-6 h-6 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">
                            {item.quantity}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-slate-800 leading-tight">
                              {item.productName}
                            </p>
                            {item.modifiers && item.modifiers.length > 0 && (
                              <div className="text-[10px] text-slate-500 italic mt-0.5">
                                ({item.modifiers.map((mod: any) => mod.name).join(', ')})
                              </div>
                            )}
                            {item.notes && (
                              <div className="text-[10px] text-amber-600 font-medium mt-1">
                                Note: {item.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 mt-auto flex gap-2">
                      {kot.status === 'PENDING' && (
                        <Button 
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => { setSelectedKot(kot); setIsTimerDialogOpen(true); }}
                        >
                          Accept
                        </Button>
                      )}
                      {kot.status === 'PENDING' && (
                        <Button 
                          variant="outline"
                          className="w-full border-red-200 text-red-500 rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => { setSelectedKot(kot); setIsRejectDialogOpen(true); }}
                        >
                          Reject
                        </Button>
                      )}
                      {kot.status === 'ACCEPTED' && (
                        <Button 
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => updateKotStatus(kot.id, 'PREPARING')}
                        >
                          Start Prep
                        </Button>
                      )}
                      {kot.status === 'PREPARING' && (
                        <Button 
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => updateKotStatus(kot.id, 'READY')}
                        >
                          Mark Ready
                        </Button>
                      )}
                      {kot.status === 'READY' && (
                        <Button 
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => updateKotStatus(kot.id, 'COMPLETED')}
                        >
                          Served
                        </Button>
                      )}
                      <Button 
                        variant="outline"
                        size="icon"
                        className="rounded-xl border-slate-200 shrink-0 h-10 w-10"
                        onClick={() => handleReprintKot(kot.id)}
                        title="Reprint Ticket"
                      >
                        <Printer size={16} />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
            {filteredKots.length === 0 && (
              <div className="col-span-full py-32 text-center">
                <div className="flex flex-col items-center opacity-20 text-slate-400">
                  <ChefHat size={80} />
                  <p className="mt-6 font-mono font-bold uppercase tracking-widest text-xl">Kitchen Clear</p>
                  <p className="text-sm font-sans uppercase mt-2">No active KOTs</p>
                </div>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Billing / Checkout Modal */}
      <Dialog open={isBillingOpen} onOpenChange={setIsBillingOpen}>
        <DialogContent className="rounded-3xl border-none max-w-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-slate-900">Complete Payment</DialogTitle>
            <CardDescription className="text-slate-500">
              Processing order <span className="font-mono font-bold text-slate-900">#{selectedOrder?.id?.slice(0, 5)}</span> for <span className="font-bold text-slate-900">Table {selectedOrder?.tableNumber || 'WALK-IN'}</span>
            </CardDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-6">
            <div className="bg-slate-900 text-white p-6 rounded-2xl flex justify-between items-center">
              <div>
                <p className="text-xs uppercase font-bold opacity-60">Total Amount Due</p>
                <p className="text-3xl font-bold">
                  {company?.currency || 'NGN'}{(selectedOrder?.totalAmount || 0).toLocaleString()}
                </p>
                {company?.secondaryCurrency && company?.exchangeRate && (
                  <p className="text-sm opacity-50">{company.secondaryCurrency}{((selectedOrder?.totalAmount || 0) * company.exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                )}
              </div>
              <div className="bg-white/10 p-3 rounded-xl">
                <Printer size={24} />
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Select Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                {['CASH', 'POS', 'TRANSFER', 'ONLINE'].map((method) => (
                  <Button
                    key={method}
                    variant={paymentMethod === method ? 'default' : 'outline'}
                    className={cn(
                      "rounded-xl h-14 font-bold border-slate-200",
                      paymentMethod === method ? "bg-slate-900 shadow-lg shadow-slate-900/20" : "hover:bg-slate-50"
                    )}
                    onClick={() => setPaymentMethod(method)}
                  >
                    {method}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleProcessPayment} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-14 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-600/20">
              Confirm Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Order Confirmation */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="rounded-3xl border-none max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-900">Cancel Order?</DialogTitle>
            <CardDescription>
              Are you sure you want to cancel order <span className="font-mono font-bold text-slate-900">#{orderToCancel?.id?.slice(0, 5)}</span>? 
              This action will notify the kitchen and is generally irreversible.
            </CardDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-4">
            <Button 
              variant="destructive" 
              className="rounded-xl bg-red-600 hover:bg-red-700 h-12 font-bold"
              onClick={handleCancelOrder}
            >
              Yes, Cancel Order
            </Button>
            <Button variant="ghost" className="rounded-xl h-12" onClick={() => setIsCancelDialogOpen(false)}>
              Keep Order
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
