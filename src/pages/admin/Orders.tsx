import React, { useState, useEffect } from 'react';
import { 
  ClipboardList, 
  Search, 
  Filter, 
  ChefHat, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Truck,
  Ban,
  MoreVertical,
  LayoutGrid,
  List
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
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
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 border-amber-200",
  ACCEPTED: "bg-blue-100 text-blue-700 border-blue-200",
  PREPARING: "bg-indigo-100 text-indigo-700 border-indigo-200",
  READY: "bg-emerald-100 text-emerald-700 border-emerald-200",
  COMPLETED: "bg-slate-100 text-slate-500 border-slate-200",
  CANCELLED: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_ICONS: Record<string, any> = {
  PENDING: Clock,
  ACCEPTED: CheckCircle2,
  PREPARING: ChefHat,
  READY: AlertCircle,
  COMPLETED: Truck,
  CANCELLED: Ban,
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

  const fetchData = async () => {
    try {
      const authHeader = { 'Authorization': `Bearer ${token}` };
      const [ordersRes, kotsRes, stationsRes] = await Promise.all([
        fetch('/api/admin/orders', { headers: authHeader }),
        fetch('/api/admin/kots', { headers: authHeader }),
        fetch('/api/stations', { headers: authHeader })
      ]);

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
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [token]);

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

  const updateKotStatus = async (kotId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/kots/${kotId}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        toast.success(`KOT status updated`);
        fetchData();
      }
    } catch (err) {
      toast.error('Failed to update KOT status');
    }
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(search.toLowerCase()) || 
                         order.tableNumber?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredKots = kots.filter(kot => {
    const matchesStation = stationFilter === 'ALL' || kot.stationId === stationFilter;
    const isActive = ['PENDING', 'ACCEPTED', 'PREPARING', 'READY'].includes(kot.status);
    return matchesStation && isActive;
  });

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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40 rounded-xl border-slate-200 bg-white">
                  <SelectValue placeholder="Filter Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="ACCEPTED">Accepted</SelectItem>
                  <SelectItem value="PREPARING">Preparing</SelectItem>
                  <SelectItem value="READY">Ready</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Select value={stationFilter} onValueChange={setStationFilter}>
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
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
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {order.items.slice(0, 2).map((item: any) => (
                            <span key={item.id} className="text-xs text-slate-600 block">
                              {item.quantity}x {item.product.name}
                            </span>
                          ))}
                          {order.items.length > 2 && (
                            <span className="text-[10px] text-slate-400 font-medium italic">
                              + {order.items.length - 2} more items
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        ${order.totalAmount.toFixed(2)}
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
            {filteredKots.map((kot) => {
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
                        {new Date(kot.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </CardDescription>
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
                              {item.product.name}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="pt-4 border-t border-slate-100 mt-auto flex gap-2">
                      {kot.status === 'PENDING' && (
                        <Button 
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 font-bold text-xs uppercase"
                          onClick={() => updateKotStatus(kot.id, 'ACCEPTED')}
                        >
                          Accept
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
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
                            <SelectItem value="COMPLETED">Completed</SelectItem>
                            <SelectItem value="CANCELLED">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {order.items?.slice(0, 2).map((item: any) => (
                            <span key={item.id} className="text-xs text-slate-600 block">
                              {item.quantity}x {item.product?.name}
                            </span>
                          ))}
                          {order.items?.length > 2 && (
                            <span className="text-[10px] text-slate-400 font-medium italic">
                              + {order.items.length - 2} more items
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-900">
                        ${order.totalAmount.toFixed(2)}
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
      </Tabs>
    </div>
  );
}
