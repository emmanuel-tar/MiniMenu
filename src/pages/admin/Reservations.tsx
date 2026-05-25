import React, { useEffect, useState } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Users, 
  Phone, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/lib/utils';

export default function Reservations() {
  const { token } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  
  const [newBooking, setNewBooking] = useState({
    customerName: '',
    phone: '',
    tableId: '',
    reservationTime: '',
    guests: '2'
  });

  const fetchData = async () => {
    try {
      const [resRes, tableRes] = await Promise.all([
        fetch('/api/admin/reservations', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/tables')
      ]);
      
      if (resRes.ok) setReservations(await resRes.json());
      if (tableRes.ok) setTables(await tableRes.json());
    } catch (err) {
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchData();
  }, [token]);

  const handleAddBooking = async () => {
    if (!newBooking.customerName || !newBooking.reservationTime || !newBooking.tableId) {
      toast.error('Please fill required fields');
      return;
    }
    try {
      const res = await fetch('/api/admin/reservations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(newBooking)
      });
      if (res.ok) {
        toast.success('Reservation created');
        setIsAddOpen(false);
        setNewBooking({ customerName: '', phone: '', tableId: '', reservationTime: '', guests: '2' });
        fetchData();
      }
    } catch (err) {
      toast.error('Error creating reservation');
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/admin/reservations/${id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        toast.success(`Booking ${status.toLowerCase()}`);
        fetchData();
      }
    } catch (err) {
      toast.error('Update failed');
    }
  };

  const filtered = reservations.filter(r => 
    r.customerName.toLowerCase().includes(search.toLowerCase()) || 
    r.phone?.includes(search)
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <CalendarIcon className="text-slate-400" size={32} />
            Table Reservations
          </h2>
          <p className="text-slate-500">Manage bookings and guest seatings</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl bg-slate-900 px-6">
              <Plus className="mr-2" size={18} /> New Booking
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-md border-none shadow-2xl">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold">Add Reservation</DialogTitle>
              <CardDescription>Enter details for the new table booking.</CardDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Customer Name*</Label>
                <Input 
                  value={newBooking.customerName} 
                  onChange={e => setNewBooking({...newBooking, customerName: e.target.value})} 
                  placeholder="e.g. John Doe"
                  className="rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input 
                    value={newBooking.phone} 
                    onChange={e => setNewBooking({...newBooking, phone: e.target.value})} 
                    placeholder="080..."
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Guests</Label>
                  <Input 
                    type="number" 
                    value={newBooking.guests} 
                    onChange={e => setNewBooking({...newBooking, guests: e.target.value})} 
                    className="rounded-xl"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Date & Time*</Label>
                <Input 
                  type="datetime-local" 
                  value={newBooking.reservationTime} 
                  onChange={e => setNewBooking({...newBooking, reservationTime: e.target.value})} 
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Assign Table*</Label>
                <Select value={newBooking.tableId} onValueChange={v => setNewBooking({...newBooking, tableId: v})}>
                  <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Table" /></SelectTrigger>
                  <SelectContent>
                    {tables.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name} ({t.status})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAddBooking} className="w-full bg-slate-900 rounded-xl h-12 font-bold shadow-lg shadow-slate-900/20">
                Create Reservation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            placeholder="Search by customer name or phone..." 
            className="pl-10 border-none bg-transparent focus-visible:ring-0 shadow-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="rounded-3xl border-none shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="font-semibold text-slate-600">Customer</TableHead>
                <TableHead className="font-semibold text-slate-600">Schedule</TableHead>
                <TableHead className="font-semibold text-slate-600">Guests</TableHead>
                <TableHead className="font-semibold text-slate-600">Table</TableHead>
                <TableHead className="font-semibold text-slate-600">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((res) => (
                <TableRow key={res.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="font-bold text-slate-900">{res.customerName}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Phone size={10} /> {res.phone || 'No phone'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium text-slate-700">
                      {new Date(res.reservationTime).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="text-xs text-slate-400 font-mono">
                      {new Date(res.reservationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-none font-bold">
                      {res.guests} Guests
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="font-bold text-slate-700">T-{res.table?.name || 'Unassigned'}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "text-[10px] font-bold uppercase border-none",
                      res.status === 'CONFIRMED' ? "bg-emerald-50 text-emerald-600" :
                      res.status === 'PENDING' ? "bg-amber-50 text-amber-600" :
                      res.status === 'CANCELLED' ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"
                    )}>
                      {res.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {res.status !== 'CONFIRMED' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-500 rounded-full hover:bg-emerald-50" onClick={() => updateStatus(res.id, 'CONFIRMED')}>
                          <CheckCircle2 size={16} />
                        </Button>
                      )}
                      {res.status !== 'CANCELLED' && (
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500 rounded-full hover:bg-rose-50" onClick={() => updateStatus(res.id, 'CANCELLED')}>
                          <XCircle size={16} />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-20">
                    <div className="flex flex-col items-center opacity-20 text-slate-400">
                      <CalendarIcon size={64} />
                      <p className="mt-4 font-mono font-bold uppercase">No reservations found</p>
                    </div>
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