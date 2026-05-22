import React, { useEffect, useState } from 'react';
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from '@/components/ui/dialog';
import { 
  Table as TableUI, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, LayoutGrid, QrCode, ExternalLink, Printer, Download, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';
import { QRCodeSVG } from 'qrcode.react';

export default function TableManagement() {
  const { token } = useAuth();
  const [tables, setTables] = useState<any[]>([]);
  const [newTableName, setNewTableName] = useState('');
  const [selectedTable, setSelectedTable] = useState<any>(null);
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/tables');
      if (res.ok) setTables(await res.json());
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddTable = async () => {
    if (!newTableName) return;
    const res = await fetch('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ name: newTableName }),
    });
    if (res.ok) {
      toast.success('Table created');
      setNewTableName('');
      fetchData();
    }
  };

  const toggleTableActive = async (id: string, active: boolean) => {
    const res = await fetch(`/api/tables/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ active }),
    });
    if (res.ok) fetchData();
  };

  const getQRLink = (id: string) => `${window.location.origin}/menu/${id}`;

  const openQrDialog = (table: any) => {
    setSelectedTable(table);
    setIsQrDialogOpen(true);
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
            <LayoutGrid className="text-slate-400" size={32} />
            Table Management
          </h2>
          <p className="text-slate-500">Manage dining areas and generate QR codes for ordering</p>
        </div>
        
        <Dialog>
          <DialogTrigger asChild>
            <Button className="rounded-xl bg-slate-900">
              <Plus className="mr-2" size={18} /> Add New Table
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl border-none">
            <DialogHeader>
              <DialogTitle>Add Table</DialogTitle>
              <CardDescription>Enter a name or number for the table.</CardDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Table Name/Number</Label>
                <Input 
                  value={newTableName} 
                  onChange={e => setNewTableName(e.target.value)}
                  placeholder="e.g. Table 05"
                />
              </div>
              <Button onClick={handleAddTable} className="w-full bg-slate-900">Create Table</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <TableUI>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-slate-100 hover:bg-transparent">
                <TableHead>Table Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>QR Link</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tables.map((table: any) => (
                <TableRow key={table.id} className="border-slate-50 hover:bg-slate-50/50">
                  <TableCell className="font-bold text-slate-900">{table.name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "text-[10px] font-bold uppercase",
                      table.status === 'AVAILABLE' ? "text-emerald-600 border-emerald-100 bg-emerald-50" : "text-amber-600 border-amber-100 bg-amber-50"
                    )}>
                      {table.status || 'AVAILABLE'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn("px-2 py-0 text-[10px]", table.active ? "bg-slate-900" : "bg-slate-200 text-slate-500")}>
                      {table.active ? 'ACTIVE' : 'INACTIVE'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openQrDialog(table)}>
                        <QrCode size={14} className="mr-1" /> View QR
                      </Button>
                      <span className="truncate max-w-37.5">{getQRLink(table.id)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => window.open(getQRLink(table.id), '_blank')}>
                        <ExternalLink size={16} className="text-slate-400" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </TableUI>
        </CardContent>
      </Card>

      <Dialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen}>
        <DialogContent className="max-w-xs rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-center print:block">Table QR Code</DialogTitle>
            <CardDescription className="text-center print:block">{selectedTable?.name}</CardDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center p-6 gap-6 print:p-0">
            <div className="p-4 bg-white rounded-2xl border-4 border-slate-900 shadow-xl print:shadow-none print:border-none">
              {selectedTable && (
                <QRCodeSVG 
                  value={getQRLink(selectedTable.id)} 
                  size={256}
                  level="H"
                  includeMargin={true}
                />
              )}
            </div>
            <Button className="w-full bg-slate-900 rounded-xl" onClick={() => window.print()}>
              <Printer className="mr-2" size={18} /> Print QR Code
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}