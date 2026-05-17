import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Plus, 
  Search, 
  ArrowUpCircle, 
  ArrowDownCircle, 
  AlertTriangle 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface StockLog {
  id: string;
  change: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdAt: string;
}

interface InventoryItem {
  id: string;
  name: string;
  description: string;
  sku: string;
  unit: string;
  quantity: number;
  minStock: number;
  logs: StockLog[];
}

export default function Inventory() {
  const { token } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', unit: '', minStock: '0', sku: '' });
  
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);
  const [adjustment, setAdjustment] = useState({ change: '', reason: 'RESTOCK' });

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (err) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchInventory();
    }
  }, [token]);

  const handleAddItem = async () => {
    if (!newItem.name || !newItem.unit) {
      toast.error('Name and Unit are required');
      return;
    }
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          ...newItem,
          minStock: parseFloat(newItem.minStock),
          quantity: 0
        })
      });
      if (res.ok) {
        toast.success('Inventory item added');
        setIsAddOpen(false);
        setNewItem({ name: '', unit: '', minStock: '0', sku: '' });
        fetchInventory();
      }
    } catch (err) {
      toast.error('Error adding item');
    }
  };

  const handleAdjustStock = async () => {
    if (!adjustingItem || !adjustment.change) {
      toast.error('Adjustment amount is required');
      return;
    }
    try {
      const res = await fetch(`/api/inventory/${adjustingItem.id}/adjust`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify({
          change: parseFloat(adjustment.change),
          reason: adjustment.reason
        })
      });
      if (res.ok) {
        toast.success('Stock adjusted');
        setIsAdjustOpen(false);
        setAdjustment({ change: '', reason: 'RESTOCK' });
        fetchInventory();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Adjustment failed');
      }
    } catch (err) {
      toast.error('Error adjusting stock');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    item.sku?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <Package className="text-slate-400" size={32} />
            Inventory
          </h2>
          <p className="text-slate-500">Track raw materials and stock levels</p>
        </div>
        
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger>
            <Button className="rounded-xl bg-slate-900 px-6">
              <Plus className="mr-2" size={18} /> New Item
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl max-w-md">
            <DialogHeader>
              <DialogTitle>Add Inventory Item</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label>Item Name*</Label>
                  <Input placeholder="e.g. Flour, Milk, etc." value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>SKU / Code</Label>
                  <Input placeholder="INV-001" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} className="rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label>Unit* (e.g. kg, L, pcs)</Label>
                  <Input placeholder="kg" value={newItem.unit} onChange={e => setNewItem({...newItem, unit: e.target.value})} className="rounded-xl" />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Alert Threshold (Low Stock)</Label>
                  <Input type="number" value={newItem.minStock} onChange={e => setNewItem({...newItem, minStock: e.target.value})} className="rounded-xl" />
                </div>
              </div>
              <Button onClick={handleAddItem} className="bg-slate-900 rounded-xl h-12">Save Item</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input 
            placeholder="Search by name or sku..." 
            className="pl-10 border-none bg-transparent focus-visible:ring-0 shadow-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card className="rounded-3xl border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead className="font-semibold text-slate-600">Item Name</TableHead>
                <TableHead className="font-semibold text-slate-600">SKU</TableHead>
                <TableHead className="font-semibold text-slate-600">Stock Level</TableHead>
                <TableHead className="font-semibold text-slate-600">Recent Activity</TableHead>
                <TableHead className="font-semibold text-slate-600 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} className="border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <TableCell>
                    <div className="font-semibold text-slate-800">{item.name}</div>
                    <div className="text-xs text-slate-400 font-mono uppercase tracking-wider">{item.unit}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-slate-500">{item.sku || 'N/A'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className={cn(
                          "font-bold text-xl leading-none",
                          item.quantity <= item.minStock ? "text-red-500" : "text-slate-900"
                        )}>
                          {item.quantity}
                        </span>
                        <span className="text-[10px] text-slate-400 font-bold uppercase mt-1">Available</span>
                      </div>
                      {item.quantity <= item.minStock && (
                        <div className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-full text-[10px] font-bold">
                          <AlertTriangle size={10} />
                          LOW
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      {item.logs?.slice(0, 2).map(log => (
                        <div key={log.id} className="text-[10px] flex items-center gap-1 text-slate-500">
                          <span className={cn(
                            "font-bold",
                            log.change > 0 ? "text-emerald-500" : "text-red-500"
                          )}>
                            {log.change > 0 ? '+' : ''}{log.change}
                          </span>
                          <span className="text-slate-400 font-medium">{log.reason?.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setAdjustingItem(item);
                        setIsAdjustOpen(true);
                      }}
                      className="rounded-xl border-slate-200 hover:bg-slate-50"
                    >
                      Adjust
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredItems.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-20">
                    <div className="flex flex-col items-center text-slate-400">
                      <Package size={48} className="opacity-20 mb-4" />
                      <p className="font-mono text-sm">NO INVENTORY ITEMS FOUND</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isAdjustOpen} onOpenChange={setIsAdjustOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Stock Adjustment</DialogTitle>
            <p className="text-sm text-slate-500">{adjustingItem?.name}</p>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Change Quantity (+ or -)</Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="number" 
                  placeholder="e.g. 10 or -5" 
                  value={adjustment.change}
                  onChange={e => setAdjustment({...adjustment, change: e.target.value})}
                  className="rounded-xl text-lg h-12"
                />
                <div className="bg-slate-100 p-1.5 rounded-xl flex flex-col gap-1">
                  <ArrowUpCircle className={cn(
                    "transition-colors",
                    parseFloat(adjustment.change) > 0 ? "text-emerald-500" : "text-slate-300"
                  )} size={20} />
                  <ArrowDownCircle className={cn(
                    "transition-colors",
                    parseFloat(adjustment.change) < 0 ? "text-red-500" : "text-slate-300"
                  )} size={20} />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reason for adjustment</Label>
              <select 
                className="w-full bg-slate-50 border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-slate-900 transition-all outline-none"
                value={adjustment.reason}
                onChange={e => setAdjustment({...adjustment, reason: e.target.value})}
              >
                <option value="RESTOCK">📦 Restock</option>
                <option value="CONSUMPTION">🍳 Consumption</option>
                <option value="SPOILAGE">🗑️ Spoilage</option>
                <option value="ADJUSTMENT">🔧 Manual Adjustment</option>
              </select>
            </div>
            
            {adjustingItem && (
              <div className="bg-slate-900 text-white p-4 rounded-2xl flex justify-between items-end shadow-xl shadow-slate-900/10">
                <div>
                  <p className="text-[10px] uppercase font-bold opacity-60">Resulting Stock</p>
                  <p className="text-2xl font-bold">
                    {adjustingItem.quantity + (parseFloat(adjustment.change) || 0)}
                    <span className="text-sm font-normal opacity-60 ml-2">{adjustingItem.unit}</span>
                  </p>
                </div>
                {parseFloat(adjustment.change) !== 0 && (
                  <Badge className={cn(
                    "border-none",
                    parseFloat(adjustment.change) > 0 ? "bg-emerald-500" : "bg-red-500"
                  )}>
                    {parseFloat(adjustment.change) > 0 ? '+ ' : ''}{adjustment.change}
                  </Badge>
                )}
              </div>
            )}

            <Button onClick={handleAdjustStock} className="w-full bg-slate-900 rounded-xl h-12 mt-4">
              Apply Adjustment
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
