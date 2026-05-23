import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { 
  Users, 
  ShoppingBag, 
  TrendingUp, 
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
  Bell,
  Check,
  History,
  Timer,
  Trash2,
  CreditCard,
  Banknote,
  Building
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function Dashboard() {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    totalSales: 0,
    activeOrders: 0,
    pendingOrders: 0,
    totalProducts: 0
  });
  const [recentOrders, setRecentOrders] = useState([]);
  const [waiterCalls, setWaiterCalls] = useState<any[]>([]);
  const [handledCalls, setHandledCalls] = useState<any[]>([]);
  const [paymentRequests, setPaymentRequests] = useState<any[]>([]);
  const [isClearHistoryOpen, setIsClearHistoryOpen] = useState(false);

  // Persist socket connection
  const socket = useMemo(() => io(), []);

  const avgResponseTime = useMemo(() => {
    if (handledCalls.length === 0) return '0s';
    const totalMs = handledCalls.reduce((acc: number, call: any) => {
      const start = new Date(call.createdAt).getTime();
      const end = new Date(call.handledAt).getTime();
      return acc + (end - start);
    }, 0);
    const avgMs = totalMs / handledCalls.length;
    const mins = Math.floor(avgMs / 60000);
    const secs = Math.floor((avgMs % 60000) / 1000);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }, [handledCalls]);

  const fetchData = async () => {
    try {
      const prodRes = await fetch('/api/menu/products');
      const prodData = await prodRes.json();
      
      const orderRes = await fetch('/api/admin/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const orderData = await orderRes.json();
      
      const pending = orderData.filter((o: any) => o.status === 'PENDING').length;
      const active = orderData.filter((o: any) => ['ACCEPTED', 'PREPARING', 'READY'].includes(o.status)).length;
      const sales = orderData.reduce((acc: number, o: any) => acc + o.totalAmount, 0);

      setStats({
        totalSales: sales,
        activeOrders: active,
        pendingOrders: pending,
        totalProducts: prodData.length
      });
      setRecentOrders(orderData.sort((a: any, b: any) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ).slice(0, 5));
    } catch (err) {
      console.error(err);
    }
  };

  const fetchWaiterCalls = async () => {
    try {
      const res = await fetch('/api/admin/waiter-calls', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setWaiterCalls(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchHandledCalls = async () => {
    try {
      const res = await fetch('/api/admin/waiter-calls/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setHandledCalls(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  const fetchPaymentRequests = async () => {
    try {
      const res = await fetch('/api/admin/payment-selections', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) setPaymentRequests(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchWaiterCalls();
    fetchHandledCalls();
    fetchPaymentRequests();

    socket.on("waiter-requested", (call: any) => {
      setWaiterCalls(prev => [...prev, call]);
    });

    socket.on("waiter-call-dismissed", (id: string) => {
      setWaiterCalls((prev: any[]) => prev.filter((c: any) => c.id !== id));
    });

    socket.on("waiter-call-handled", (call: any) => {
      setHandledCalls((prev: any[]) => [call, ...prev].slice(0, 10));
    });

    socket.on("payment-submitted", (data: any) => {
      fetchData();
      toast.success(`💳 Payment Submitted: Table ${data.tableNumber}`, {
        description: `Method: ${data.method}. Please verify and confirm.`
      });
    });

    socket.on("payment-method-updated", (selection: any) => {
      setPaymentRequests(prev => {
        const filtered = prev.filter(p => p.orderId !== selection.orderId);
        return [...filtered, selection];
      });
      toast.info(`💰 ${selection.tableNumber} selected ${selection.method}`, {
        description: `Order #${selection.orderId.slice(0, 5)}`
      });
    });

    socket.on("payment-method-cleared", (orderId: string) => {
      setPaymentRequests(prev => prev.filter(p => p.orderId !== orderId));
    });

    socket.on("waiter-history-cleared", () => {
      setHandledCalls([]);
    });

    socket.on("new-order-received", (order: any) => {
      fetchData(); // Immediate refresh of stats and recent orders table
      toast.success(`🔔 New Order! Table ${order.tableNumber} - $${order.totalAmount.toFixed(2)}`, {
        description: `Order #${order.id.slice(0, 5)}`,
        duration: 5000,
      });
    });

    socket.on("order-status-updated", () => fetchData());

    const interval = setInterval(fetchData, 10000); // Poll every 10s

    return () => clearInterval(interval);
  }, [token, socket]);

  const updateOrderStatus = async (orderId: string, newStatus: string) => {
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
        toast.success(`Order status updated to ${newStatus}`);
        fetchData();
      } else {
        toast.error('Failed to update status');
      }
    } catch (err) {
      toast.error('Connection error');
    }
  };

  const dismissWaiterCall = (id: string) => {
    socket.emit("dismiss-waiter-call", id);
    toast.success("Waiter request handled");
  };

  const getMethodIcon = (method: string) => {
    if (method === 'TRANSFER') return <Building size={20} />;
    if (method === 'CASH') return <Banknote size={20} />;
    return <CreditCard size={20} />;
  };

  const clearHistory = () => {
    socket.emit("clear-waiter-history");
    toast.success("Waiter history cleared");
    setIsClearHistoryOpen(false);
  };

  return (
    <div className="space-y-8">
      {/* Active Waiter Requests */}
      {waiterCalls.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-1">
            <Bell className="text-amber-500 animate-bounce" size={20} />
            Attention Required ({waiterCalls.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {waiterCalls.map((call) => (
              <Card key={call.id} className="border-none shadow-md bg-amber-50/50 border-l-4 border-amber-400">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600">
                      <Bell size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">{call.tableName}</p>
                      <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">
                        Requested {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full hover:bg-emerald-100 hover:text-emerald-600" onClick={() => dismissWaiterCall(call.id)}>
                    <Check size={18} />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active Payment Requests */}
      {paymentRequests.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 px-1">
            <CreditCard className="text-emerald-500" size={20} />
            Payment Notifications ({paymentRequests.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {paymentRequests.map((req) => (
              <Card key={req.id} className="border-none shadow-md bg-emerald-50/50 border-l-4 border-emerald-400">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                        {getMethodIcon(req.method)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{req.tableNumber}</p>
                        <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
                          {req.method} Selected
                        </p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-mono">#{req.orderId.slice(0, 5)}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Handled Waiter Requests History */}
      {handledCalls.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <History className="text-slate-400" size={20} />
              Recently Handled
            </h3>
            <Dialog open={isClearHistoryOpen} onOpenChange={setIsClearHistoryOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-lg flex items-center gap-2"
                >
                  <Trash2 size={14} />
                  Clear History
                </Button>
              </DialogTrigger>
              <DialogContent className="rounded-2xl border-none max-w-sm">
                <DialogHeader>
                  <DialogTitle>Clear History</DialogTitle>
                  <CardDescription>Are you sure you want to clear the recently handled waiter requests? This action cannot be undone.</CardDescription>
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0 pt-4">
                  <Button variant="ghost" onClick={() => setIsClearHistoryOpen(false)} className="rounded-xl">Cancel</Button>
                  <Button variant="destructive" onClick={clearHistory} className="rounded-xl bg-red-500 hover:bg-red-600 text-white">
                    Clear Everything
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {handledCalls.map((call) => (
              <Card key={call.id} className="border-none shadow-sm bg-white border-l-4 border-slate-200 opacity-70">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                      <Check size={20} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-700">{call.tableName}</p>
                      <div className="flex flex-col">
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                          Requested {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">
                          Handled {new Date(call.handledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        {React.useMemo(() => [
          { title: 'Total Sales', value: `$${stats.totalSales.toFixed(2)}`, icon: TrendingUp, delta: '+12.5%', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { title: 'Active Orders', value: stats.activeOrders.toString(), icon: ShoppingBag, delta: '+2', color: 'text-blue-600', bg: 'bg-blue-50' },
          { title: 'Pending Orders', value: stats.pendingOrders.toString(), icon: Clock, delta: '-1', color: 'text-amber-600', bg: 'bg-amber-50' },
          { title: 'Avg Response', value: avgResponseTime, icon: Timer, delta: '-12%', color: 'text-rose-600', bg: 'bg-rose-50' },
          { title: 'Total Products', value: stats.totalProducts.toString(), icon: Users, delta: '0', color: 'text-indigo-600', bg: 'bg-indigo-50' },
        ], [stats, avgResponseTime]).map((card) => (
          <Card key={card.title} className="border-none shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">{card.title}</CardTitle>
              <div className={`${card.bg} p-2 rounded-lg`}>
                <card.icon className={card.color} size={18} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">{card.value}</div>
              <div className="flex items-center gap-1 mt-1">
                {card.delta.startsWith('+') ? <ArrowUpRight size={14} className="text-emerald-500" /> : <ArrowDownRight size={14} className="text-red-500" />}
                <span className={`text-xs font-medium ${card.delta.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                  {card.delta}
                </span>
                <span className="text-xs text-slate-400">vs last month</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders Table */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-bold text-slate-900">Recent Orders</CardTitle>
            <Badge variant="outline" className="text-xs font-mono text-slate-500">Live Updates</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="w-[100px]">Order ID</TableHead>
                <TableHead>Table</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order: any) => (
                <TableRow key={order.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-medium text-slate-600">#{order.id.slice(0, 5)}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold border-none">
                      T-{order.tableNumber || 'WALK'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select 
                      defaultValue={order.status} 
                      onValueChange={(val) => updateOrderStatus(order.id, val)}
                    >
                      <SelectTrigger className="h-8 w-32 border-none bg-slate-50 rounded-lg text-[10px] font-bold uppercase">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PENDING" className="text-[10px] uppercase">Pending</SelectItem>
                        <SelectItem value="ACCEPTED" className="text-[10px] uppercase">Accepted</SelectItem>
                        <SelectItem value="PREPARING" className="text-[10px] uppercase">Preparing</SelectItem>
                        <SelectItem value="READY" className="text-[10px] uppercase">Ready</SelectItem>
                        <SelectItem value="COMPLETED" className="text-[10px] uppercase">Completed</SelectItem>
                        <SelectItem value="CANCELLED" className="text-[10px] uppercase">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-slate-500 text-sm">
                    {order.items.length} items
                  </TableCell>
                  <TableCell className="text-right font-bold text-slate-900">
                    ${order.totalAmount.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
              {recentOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-slate-400 italic">
                    No orders found. Scan a QR code to start!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
