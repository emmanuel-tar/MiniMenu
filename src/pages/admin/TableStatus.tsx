import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import { 
  LayoutGrid, 
  Clock, 
  Users, 
  Coffee,
  Bell,
  ArrowRightLeft,
  UserPlus,
  Trash2,
  CheckCircle,
  CreditCard
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// import { Label } from '@/components/ui/label';
const Label = ({ className, children }: { className?: string; children: React.ReactNode }) => (
  <span className={className}>{children}</span>
);
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/src/hooks/useAuth';
import { cn, formatPrice } from '@/src/lib/utils';

import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: "bg-emerald-400",
  OCCUPIED: "bg-amber-400",
  CLEANING: "bg-slate-400",
  RESERVED: "bg-purple-500",
  BILL_REQUESTED: "bg-blue-500"
};

const OccupancyTimer = ({ createdAt }: { createdAt: string }) => {
  const [duration, setDuration] = useState('');

  useEffect(() => {
    const updateTimer = () => {
      const start = new Date(createdAt).getTime();
      const now = new Date().getTime();
      const diffInMs = now - start;
      
      const mins = Math.floor(diffInMs / 60000);
      const hours = Math.floor(mins / 60);
      
      if (hours > 0) {
        setDuration(`${hours}h ${mins % 60}m`);
      } else {
        setDuration(`${mins}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [createdAt]);

  return <span className="text-amber-600 font-bold">{duration}</span>;
};

export default function TableStatus() {
  const { token } = useAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [company, setCompany] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTableBreakdown, setSelectedTableBreakdown] = useState<any>(null);

  const socket = useMemo(() => io(), []);

  const fetchData = async () => {
    try {
      const [tableRes, companyRes, staffRes] = await Promise.all([
        fetch('/api/admin/tables/status', {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/company'),
        fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      
      if (tableRes.ok) setTables(await tableRes.json());
      if (companyRes.ok) setCompany(await companyRes.json());
      if (staffRes.ok) setStaff(await staffRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();

    socket.on("new-order-received", fetchData);
    socket.on("order-status-updated", fetchData);
    socket.on("order-paid", fetchData);
    socket.on("order-completed", fetchData);
    socket.on("order-payment-update", fetchData);
    socket.on("payment-method-updated", fetchData);
    socket.on("payment-method-cleared", fetchData);
    socket.on("waiter-requested", fetchData);
    socket.on("waiter-call-dismissed", fetchData);
    socket.on("table-status-updated", fetchData);

    const interval = setInterval(fetchData, 15000); // 15s fallback poll

    return () => {
      clearInterval(interval);
      socket.off("new-order-received");
      socket.off("order-status-updated");
      socket.off("order-paid");
      socket.off("order-completed");
      socket.off("order-payment-update");
      socket.off("payment-method-updated");
      socket.off("payment-method-cleared");
      socket.off("waiter-requested");
      socket.off("waiter-call-dismissed");
      socket.off("table-status-updated");
    };
  }, [token, socket]);

  const executeAction = async (action: string, payload: any = {}) => {
    try {
      const res = await fetch(`/api/admin/tables/${selectedTableBreakdown.id}/${action}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        toast.success(`Action: ${action} successful`);
        if (action !== 'assign-waiter') setSelectedTableBreakdown(null);
        fetchData();
      }
    } catch (err) {
      toast.error("Operation failed");
    }
  };

  const handleReleaseTable = async (tableId: string) => {
    try {
      const res = await fetch(`/api/admin/tables/${tableId}/release`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Table released successfully");
        setSelectedTableBreakdown(null);
        fetchData();
      }
    } catch (err) {
      toast.error("Failed to release table");
    }
  };

  const handleOpenTable = async (tableId: string) => {
    try {
      const res = await fetch(`/api/admin/tables/${tableId}/open`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success("Table released successfully");
        setSelectedTableBreakdown(null);
        fetchData();
      }
    } catch (err) {
      toast.error("Failed to release table");
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Loading floor layout...</div>;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
          <LayoutGrid className="text-slate-400" size={32} />
          Table Status
        </h2>
        <p className="text-slate-500">Real-time occupancy and active order tracking</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tables.map((table) => {
          const activeOrders = table.orders || [];
          const firstOrder = activeOrders[0];
          const latestOrder = activeOrders[activeOrders.length - 1];
          const isOccupied = table.status === 'OCCUPIED' || activeOrders.length > 0;
          const totalAmount = activeOrders.reduce((sum: number, o: any) => sum + o.totalAmount, 0);

          // Determine the most relevant status text to display
          let statusText = "Available"; // Default
          if (table.hasCall) {
            statusText = "Service Requested";
          } else if (table.paymentRequested) {
            statusText = "Bill Requested";
          } else if (isOccupied) { // This covers 'OCCUPIED' status and tables with active orders
            statusText = "Occupied";
          } else if (table.status === 'CLEANING') {
            statusText = "Cleaning";
          } else if (table.status === 'RESERVED') {
            statusText = "Reserved";
          }

          return (
            <Card 
              key={table.id} 
              className={cn(
              "border-none shadow-sm transition-all duration-300 overflow-hidden rounded-3xl",
              isOccupied || table.status === 'CLEANING' ? "bg-white ring-1 ring-slate-100 cursor-pointer hover:shadow-md" : "bg-slate-50/50 opacity-80",
              table.hasCall && "ring-2 ring-amber-500 shadow-lg shadow-amber-500/10",
              table.paymentRequested && !table.hasCall && "ring-2 ring-blue-500 shadow-lg shadow-blue-500/10"
            )}
              onClick={() => setSelectedTableBreakdown(table)}
            >
              <div className={cn("h-2 w-full", 
                table.hasCall ? "bg-amber-500" : 
                table.paymentRequested ? "bg-blue-500" : 
                (isOccupied ? "bg-amber-400" : "bg-emerald-400")
              )} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    {table.hasCall && (
                      <div className="flex items-center gap-1 text-amber-600 mb-1 animate-bounce">
                        <Bell size={12} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Needs Service</span>
                      </div>
                    )}
                    {table.paymentRequested && !table.hasCall && (
                      <div className="flex items-center gap-1 text-blue-600 mb-1 animate-pulse">
                        <CreditCard size={12} fill="currentColor" />
                        <span className="text-[10px] font-black uppercase tracking-tighter">Bill Requested</span>
                      </div>
                    )}
                    <CardTitle className="text-xl font-bold">{table.name}</CardTitle>
                    <CardDescription className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                      {statusText}
                      {isOccupied && firstOrder && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-slate-300" />
                          <OccupancyTimer createdAt={firstOrder.createdAt} />
                        </>
                      )}
                    </CardDescription>
                  </div>
                  <div className={cn("p-2 rounded-xl", isOccupied ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600")}>
                    {isOccupied ? <Coffee size={20} /> : <Users size={20} />}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isOccupied && firstOrder ? (
                  <div className="space-y-4 pt-2">
                    <div className="flex justify-between items-center">
                      <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-50">
                        {latestOrder?.status || 'OCCUPIED'}
                      </Badge>
                      <span className="text-sm font-bold text-slate-900">
                        {formatPrice(totalAmount, company?.currency).primary}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                      <Clock size={14} className="text-slate-300" />
                      <span>Started {new Date(firstOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ) : (
                  <div className="py-6 flex flex-col items-center justify-center text-slate-300 italic">
                    <p className="text-xs">Ready for guests</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Session Breakdown Modal */}
<Dialog open={!!selectedTableBreakdown} onOpenChange={(open: boolean) => !open && setSelectedTableBreakdown(null)}>

        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl p-0 overflow-hidden">
          <div className="bg-slate-900 p-6 text-white">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl">
                  <LayoutGrid size={24} />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">{selectedTableBreakdown?.name}</DialogTitle>
                  <DialogDescription className="text-slate-400">Detailed session breakdown</DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>
          
          <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto no-scrollbar">
            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              {!selectedTableBreakdown?.orders?.length ? (
                <Button 
                  className="bg-emerald-600 hover:bg-emerald-700 h-12 rounded-xl font-bold gap-2"
                  onClick={() => executeAction('open')}
                >
                  <CheckCircle size={18} /> Open Table
                </Button>
              ) : (
                <Button 
                  variant="outline"
                  className="h-12 rounded-xl font-bold gap-2 text-rose-600 border-rose-100"
                  onClick={() => executeAction('close')}
                >
                  <Trash2 size={18} /> Close Table
                </Button>
              )}
              <Button 
                variant="secondary" 
                className="h-12 rounded-xl font-bold gap-2"
                disabled={!selectedTableBreakdown?.orders?.length}
                onClick={() => toast.info("Select target table to transfer orders")}
              >
                <ArrowRightLeft size={18} /> Transfer
              </Button>
            </div>

            {/* Waiter Assignment */}
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Assigned Staff</Label>
<Select onValueChange={(v: string) => executeAction('assign-waiter', { waiterId: v })}>
                <SelectTrigger className="rounded-xl h-11 border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <UserPlus size={16} className="text-slate-400" />
                    <SelectValue placeholder="Assign Waiter..." />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {staff.filter(s => s.role === 'WAITER').map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order Timeline */}
            {selectedTableBreakdown?.orders?.length > 0 && (
              <div className="space-y-4">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Active Session</Label>
                {/* Existing order items mapping logic... */}
              </div>
            )}

            {!selectedTableBreakdown?.orders?.length && (
               <div className="py-12 text-center space-y-2">
                 <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-300">
                   <Coffee size={24} />
                 </div>
                 <p className="text-sm font-medium text-slate-400">No active orders for this table</p>
               </div>
            )}

            {selectedTableBreakdown?.orders?.map((order: any, idx: number) => (
              <div key={order.id} className="space-y-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                      {idx + 1}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-bold uppercase rounded-lg px-2">
                      {order.status}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                
                <div className="space-y-2 pl-8">
                  {order.items?.map((item: any) => (
                    <div key={item.id} className="flex justify-between items-center text-sm">
                      <div className="flex gap-2">
                        <span className="font-bold text-slate-900">{item.quantity}x</span>
                        <span className="text-slate-600">{item.productName}</span>
                      </div>
                      <span className="font-medium text-slate-900">
                        {formatPrice(item.price * item.quantity, company?.currency).primary}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div className="flex justify-between items-center pt-2 pl-8">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Order Total</span>
                  <span className="font-bold text-slate-900">
                    {formatPrice(order.totalAmount, company?.currency).primary}
                  </span>
                </div>
                
                {idx < (selectedTableBreakdown.orders.length - 1) && (
                  <div className="h-px bg-slate-100 mt-4" />
                )}
              </div>
            ))}
          </div>
          
          <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grand Total</p>
              <p className="text-2xl font-black text-slate-900">
                {formatPrice(
                  selectedTableBreakdown?.orders?.reduce((sum: number, o: any) => sum + o.totalAmount, 0) || 0, 
                  company?.currency
                ).primary}
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                className="rounded-xl px-4 border-rose-200 text-rose-500 hover:bg-rose-50"
                onClick={() => handleReleaseTable(selectedTableBreakdown.id)}
              >
                Release Table
              </Button>
              <Button className="rounded-xl px-6 bg-slate-900" onClick={() => setSelectedTableBreakdown(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}