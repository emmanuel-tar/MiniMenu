import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/src/hooks/useAuth';
import { 
  Building2,
  MapPin, 
  Phone, 
  Mail, 
  DollarSign, 
  Percent,
  Save,
  Plus,
  UtensilsCrossed,
  Printer as PrinterIcon,
  Receipt as ReceiptIcon,
  Wifi,
  Monitor,
  FileText,
  Settings2,
  Trash2,
  History,
  ShieldCheck,
  Users,
  UserPlus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter 
} from '@/components/ui/dialog';
import { cn } from '@/src/lib/utils';

import { useAuthFetch } from '@/src/lib/auth-fetch'; // Import the new hook

export default function Settings() {
  const { token, user } = useAuth();
  const authFetch = useAuthFetch();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [isStaffDialogOpen, setIsStaffDialogOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [printLogs, setPrintLogs] = useState<any[]>([]);
  const [stations, setStations] = useState<any[]>([]);
  const [editingStation, setEditingStation] = useState<any>(null);
  const [isStationEditDialogOpen, setIsStationEditDialogOpen] = useState(false);
  const [newStation, setNewStation] = useState({ name: '', description: '' });
  const [printers, setPrinters] = useState<any[]>([]);
  const [systemPrinters, setSystemPrinters] = useState<any[]>([]);
  const [newPrinter, setNewPrinter] = useState({
    name: '',
    type: 'BROWSER',
    ipAddress: '',
    port: '9100',
    usbIdentifier: '',
    role: 'CASHIER',
    stationId: ''
  });
  const [receiptSettings, setReceiptSettings] = useState({
    showLogo: true,
    footerText: '',
    showTax: true,
    paperSize: '80mm',
    autoPrint: false
  });
  const [newStaff, setNewStaff] = useState({
    name: '',
    email: '',
    password: '',
    role: 'WAITER',
    stationId: ''
  });
  const [company, setCompany] = useState({
    name: '',
    currency: 'NGN',
    secondaryCurrency: '',
    exchangeRate: 1.0,
    taxRate: 0,
    enableServiceCharge: false,
    serviceChargeRate: 0,
    contactEmail: '',
    phone: '',
    address: '',
    bankName: '',
    accountName: '',
    accountNumber: '',
    enableSplitBill: true,
    enableReservations: true
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const compRes = await fetch('/api/company');
        const compData = await compRes.json();
        if (compData.id) setCompany(prev => ({ ...prev, ...compData }));

        const statRes = await fetch('/api/stations');
        const statData = await statRes.json();
        setStations(statData);

        const printRes = await authFetch('/api/settings/printers');
        if (printRes.ok) setPrinters(await printRes.json());

        const receiptRes = await fetch('/api/settings/receipt');
        if (receiptRes.ok) {
          const rData = await receiptRes.json();
          if (rData.id) setReceiptSettings(rData);
        }

        const usersRes = await authFetch('/api/admin/users');
        if (usersRes.ok) setUsers(await usersRes.json());

        const logRes = await authFetch('/api/admin/audit-logs');
        if (logRes.ok) setAuditLogs(await logRes.json());

        const printLogRes = await authFetch('/api/admin/print-logs');
        if (printLogRes.ok) setPrintLogs(await printLogRes.json());

        const sysPrintersRes = await authFetch('/api/settings/system-printers');
        if (sysPrintersRes.ok) setSystemPrinters(await sysPrintersRes.json());
      } catch (err) {
        console.error(err);
      }
    };
    if (token) fetchData();
  }, [token, authFetch]);

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await authFetch('/api/company', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(company),
      });
      if (res.ok) {
        const updated = await res.json();
        setCompany(prev => ({ ...prev, ...updated }));
        toast.success('Restaurant profile updated');
      } else { // Read and display the specific error message from the backend
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to update settings');
      }
    } catch (err) {
      toast.error('Network error saving data');
    } finally {
      setLoading(false);
    }
  };

  const addStation = async () => {
    if (!newStation.name) {
      toast.error('Station name is required');
      return;
    }
    try {
      const res = await authFetch('/api/stations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStation),
      });
      if (res.ok) {
        const data = await res.json();
        setStations([...stations, data]);
        setNewStation({ name: '', description: '' });
        toast.success('Production station added.');
      } else { // Read and display the specific error message from the backend
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to add station.');
      }
    } catch (err) {
      toast.error('Network error adding station.');
    }
  };

  const updateStation = async () => {
    if (!editingStation.name) return;
    try {
      const res = await authFetch(`/api/stations/${editingStation.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingStation),
      });
      if (res.ok) {
        const data = await res.json();
        setStations(stations.map(s => s.id === data.id ? data : s));
        setIsStationEditDialogOpen(false);
        setEditingStation(null);
        toast.success('Station updated successfully');
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to update station');
      }
    } catch (err) {
      toast.error('Network error updating station');
    }
  };

  const addStaffMember = async () => {
    if (!newStaff.name || !newStaff.email || !newStaff.password) {
      toast.error('Please fill in all required fields');
      return;
    }
    try {
      const res = await authFetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newStaff),
      });
      if (res.ok) {
        toast.success('Staff account created');
        setIsStaffDialogOpen(false);
        setNewStaff({ name: '', email: '', password: '', role: 'WAITER', stationId: '' });
        const usersRes = await authFetch('/api/admin/users');
        if (usersRes.ok) setUsers(await usersRes.json());
      } else {
        toast.error('Failed to create staff account');
      }
    } catch (err) { toast.error('Error creating staff account'); }
  };

  const deleteStaffMember = async (id: string) => {
    try {
      const res = await authFetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setUsers(users.filter(u => u.id !== id));
        toast.success('Staff member removed');
      }
    } catch (err) { toast.error('Error deleting staff member'); }
  };

  const deleteStation = async (id: string) => {
    try {
      const res = await authFetch(`/api/stations/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setStations(stations.filter(s => s.id !== id));
        toast.success('Station removed');
      }
    } catch (err) { toast.error('Failed to delete station'); }
  };

  const handleTestPrint = async (stationId: string) => {
    try {
      const res = await authFetch(`/api/stations/${stationId}/test-print`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Test print sent');
      } else {
        toast.error(data.error || 'Test print failed');
      }
    } catch (err) {
      toast.error('Network error during test print');
    }
  };

  const savePrinter = async () => {
    if (!newPrinter.name) return;
    try {
      const res = await authFetch('/api/settings/printers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newPrinter,
          port: parseInt(newPrinter.port) || 9100,
          usbIdentifier: newPrinter.type === 'USB' ? newPrinter.usbIdentifier : null,
          stationId: newPrinter.stationId || null
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrinters([...printers, data]);
        setNewPrinter({ name: '', type: 'BROWSER', ipAddress: '', port: '9100', usbIdentifier: '', role: 'CASHIER', stationId: '' });
        toast.success('Printer configured');
      }
    } catch (err) {
      toast.error('Failed to add printer');
    }
  };

  const deletePrinter = async (id: string) => {
    try {
      const res = await authFetch(`/api/settings/printers/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setPrinters(printers.filter(p => p.id !== id));
        toast.success('Printer removed');
      }
    } catch (err) { toast.error('Failed to delete printer'); }
  };

  const saveReceiptSettings = async () => {
    try {
      const res = await authFetch('/api/settings/receipt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(receiptSettings),
      });
      if (res.ok) {
        toast.success('Receipt design updated.');
      } else { // Read and display the specific error message from the backend
        const errorData = await res.json();
        toast.error(errorData.error || 'Failed to save receipt settings.');
      }
    } catch (err) {
      toast.error('Network error saving receipt settings.');
    }
  };

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h2>
        <p className="text-slate-500">Configure your restaurant identity, preparation flow, and printing hardware</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl mb-8 overflow-x-auto whitespace-nowrap max-w-full">
          <TabsTrigger value="profile" className="rounded-lg gap-2"><Building2 size={16}/> Profile</TabsTrigger>
          <TabsTrigger value="stations" className="rounded-lg gap-2"><UtensilsCrossed size={16}/> Stations</TabsTrigger>
          <TabsTrigger value="printing" className="rounded-lg gap-2"><PrinterIcon size={16}/> Printing</TabsTrigger>
          <TabsTrigger value="receipt" className="rounded-lg gap-2"><ReceiptIcon size={16}/> Receipt Design</TabsTrigger>
          <TabsTrigger value="staff" className="rounded-lg gap-2"><Users size={16}/> Staff</TabsTrigger>
          <TabsTrigger value="audit" className="rounded-lg gap-2"><History size={16}/> Audit Logs</TabsTrigger>
          <TabsTrigger value="print-history" className="rounded-lg gap-2"><PrinterIcon size={16}/> Print History</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-bold flex items-center gap-2">Restaurant Profile</CardTitle>
              <CardDescription>Basic identity and financial settings</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Restaurant Name</Label>
                  <Input value={company.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCompany({...company, name: e.target.value})} placeholder="The Silver Grill" className="rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>Currency Symbol</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input value={company.currency} onChange={e => setCompany({...company, currency: e.target.value})} placeholder="NGN" className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Secondary Currency (Optional)</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input value={company.secondaryCurrency || ''} onChange={e => setCompany({...company, secondaryCurrency: e.target.value})} placeholder="USD" className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Exchange Rate (1 Primary = ? Secondary)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input type="number" step="0.0001" value={company.exchangeRate || 1} onChange={e => setCompany({...company, exchangeRate: parseFloat(e.target.value) || 1})} className="pl-10 rounded-xl border-slate-200" />
                  </div>
                  <p className="text-[10px] text-slate-400 italic">Example: 1 NGN = 0.00065 USD</p>
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input type="number" value={company.taxRate} onChange={e => setCompany({...company, taxRate: parseFloat(e.target.value) || 0})} className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Enable Service Charge</Label>
                  <div className="flex items-center space-x-2 h-10">
                    <Switch checked={company.enableServiceCharge} onCheckedChange={checked => setCompany({...company, enableServiceCharge: checked})} />
                    <span className="text-xs text-slate-500">{company.enableServiceCharge ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Service Charge (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input type="number" value={company.serviceChargeRate} onChange={e => setCompany({...company, serviceChargeRate: parseFloat(e.target.value) || 0})} className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input value={company.bankName || ''} onChange={e => setCompany({...company, bankName: e.target.value})} placeholder="e.g. Zenith Bank" className="rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>Account Name</Label>
                  <Input value={company.accountName || ''} onChange={e => setCompany({...company, accountName: e.target.value})} placeholder="e.g. Silver Grill Restaurant" className="rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>Account Number</Label>
                  <Input value={company.accountNumber || ''} onChange={e => setCompany({...company, accountNumber: e.target.value})} placeholder="0123456789" className="rounded-xl border-slate-200" />
                </div>

                <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-blue-500" />
                    Feature Controls
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <Label className="cursor-pointer">Enable Split Billing</Label>
                      <Switch checked={company.enableSplitBill} onCheckedChange={checked => setCompany({...company, enableSplitBill: checked})} />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                      <Label className="cursor-pointer">Enable Table Reservations</Label>
                      <Switch checked={company.enableReservations} onCheckedChange={checked => setCompany({...company, enableReservations: checked})} />
                    </div>
                  </div>
                </div>

                <div className="md:col-span-2 pt-4">
                  <Button type="submit" disabled={loading} className="px-8 bg-slate-900 rounded-xl h-12"><Save className="mr-2" size={18} /> Save Changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stations">
          <Card className="border-none shadow-sm">
            <CardHeader><CardTitle>Preparation Stations</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stations.map((station) => (
                  <div key={station.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 group relative">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-900">{station.name}</h4>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 text-slate-300 hover:text-emerald-500" 
                          onClick={() => handleTestPrint(station.id)}
                          title="Test Printer"
                        >
                          <PrinterIcon size={14}/>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-blue-500" onClick={() => { setEditingStation(station); setIsStationEditDialogOpen(true); }}><Settings2 size={14}/></Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-300 hover:text-red-500" onClick={() => deleteStation(station.id)}><Trash2 size={14}/></Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{station.description || 'No description'}</p>
                  </div>
                ))}
                <div className="p-4 rounded-2xl border border-dashed border-slate-300 flex flex-col gap-3">
                  <Input placeholder="Station Name" value={newStation.name} onChange={e => setNewStation({...newStation, name: e.target.value})} className="h-8 text-xs border-slate-200 bg-white" />
                  <Input placeholder="Description (Optional)" value={newStation.description} onChange={e => setNewStation({...newStation, description: e.target.value})} className="h-8 text-xs border-slate-200 bg-white" />
                  <Button size="sm" onClick={addStation} className="w-full text-xs rounded-lg"><Plus size={14} className="mr-1" /> Add Station</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Dialog open={isStationEditDialogOpen} onOpenChange={setIsStationEditDialogOpen}>
            <DialogContent className="rounded-2xl border-none">
              <DialogHeader>
                <DialogTitle>Edit Station</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={editingStation?.name || ''} onChange={e => setEditingStation({...editingStation, name: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input value={editingStation?.description || ''} onChange={e => setEditingStation({...editingStation, description: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <Label>Code (Optional)</Label>
                  <Input value={editingStation?.code || ''} onChange={e => setEditingStation({...editingStation, code: e.target.value})} />
                </div>
                <Button onClick={updateStation} className="w-full bg-slate-900">Update Station</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="printing">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-none shadow-sm">
              <CardHeader><CardTitle>Connected Printers</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {printers.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-100 rounded-xl text-slate-600">
                          {p.type === 'NETWORK' ? <Wifi size={20}/> : <Monitor size={20}/>}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">{p.name}</p>
                          <p className="text-xs text-slate-500 uppercase tracking-tighter">{p.role} • {p.type}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-emerald-50 text-emerald-600 border-none">Active</Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => deletePrinter(p.id)}><Trash2 size={14}/></Button>
                      </div>
                    </div>
                  ))}
                  {printers.length === 0 && <p className="text-center py-8 text-slate-400 italic">No printers configured yet</p>}
                </div>
              </CardContent>
            </Card>

            <Card className="border-none shadow-sm h-fit">
              <CardHeader><CardTitle className="text-lg">Add Printer</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Printer Name</Label>
                  <Input value={newPrinter.name} onChange={e => setNewPrinter({...newPrinter, name: e.target.value})} placeholder="Main Cashier" className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Connection Type</Label>
                  <Select value={newPrinter.type} onValueChange={v => setNewPrinter({...newPrinter, type: v})}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BROWSER">Browser Printing</SelectItem>
                      <SelectItem value="NETWORK">Network (Ethernet)</SelectItem>
                      <SelectItem value="USB">USB Connection</SelectItem>
                      <SelectItem value="AGENT">Local Agent (Windows)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newPrinter.type === 'NETWORK' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-[10px]">IP Address</Label>
                      <Input value={newPrinter.ipAddress} onChange={e => setNewPrinter({...newPrinter, ipAddress: e.target.value})} placeholder="192.168.1.100" className="rounded-xl" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px]">Port</Label>
                      <Input value={newPrinter.port} onChange={e => setNewPrinter({...newPrinter, port: e.target.value})} placeholder="9100" className="rounded-xl" />
                    </div>
                  </div>
                )}
                {newPrinter.type === 'USB' && (
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase font-bold text-slate-400">Select Local Printer</Label>
                    <Select value={newPrinter.usbIdentifier} onValueChange={v => setNewPrinter({...newPrinter, usbIdentifier: v})}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Choose installed printer..." />
                      </SelectTrigger>
                      <SelectContent>
                        {systemPrinters.map(p => (
                          <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Assigned Role</Label>
                  <Select value={newPrinter.role} onValueChange={v => setNewPrinter({...newPrinter, role: v})}>
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Role" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASHIER">Cashier Receipt</SelectItem>
                      <SelectItem value="KITCHEN">Kitchen KOT</SelectItem>
                      <SelectItem value="BAR">Bar KOT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={savePrinter} className="w-full bg-slate-900 rounded-xl mt-2">Connect Printer</Button>
                {/* Add a Select for stationId */}
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Assign to Station (Optional)</Label>
                  <Select 
                    value={newPrinter.stationId || undefined}
                    onValueChange={v => setNewPrinter({...newPrinter, stationId: v || ''})}
                  >
                    <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select Station" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">None</SelectItem>
                      {stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="receipt">
          <Card className="border-none shadow-sm max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText size={20}/> Receipt Configuration</CardTitle>
              <CardDescription>Customize how your customer bills appear</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-900">Show Restaurant Logo</p>
                  <p className="text-xs text-slate-500">Include your brand logo at the top of receipts</p>
                </div>
                <input type="checkbox" checked={receiptSettings.showLogo} onChange={e => setReceiptSettings({...receiptSettings, showLogo: e.target.checked})} className="w-5 h-5 accent-slate-900" />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-900">Auto-Print on Completion</p>
                  <p className="text-xs text-slate-500">Trigger print dialog immediately when order is paid</p>
                </div>
                <input type="checkbox" checked={receiptSettings.autoPrint} onChange={e => setReceiptSettings({...receiptSettings, autoPrint: e.target.checked})} className="w-5 h-5 accent-slate-900" />
              </div>
              <div className="space-y-2">
                <Label>Footer Message</Label>
                <Input value={receiptSettings.footerText} onChange={e => setReceiptSettings({...receiptSettings, footerText: e.target.value})} placeholder="e.g. Thank you for your business!" className="rounded-xl py-6" />
              </div>
              <div className="space-y-2">
                <Label>Paper Size</Label>
                <Select value={receiptSettings.paperSize} onValueChange={v => setReceiptSettings({...receiptSettings, paperSize: v})}>
                  <SelectTrigger className="rounded-xl h-12"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="80mm">Thermal 80mm</SelectItem>
                    <SelectItem value="58mm">Thermal 58mm</SelectItem>
                    <SelectItem value="A4">Standard A4</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={saveReceiptSettings} className="bg-slate-900 rounded-xl px-12 h-12">Update Template</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff">
          <Card className="border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-xl font-bold flex items-center gap-2">Staff Management</CardTitle>
                <CardDescription>Manage waiter and kitchen staff accounts</CardDescription>
              </div>
              <Dialog open={isStaffDialogOpen} onOpenChange={setIsStaffDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-xl bg-slate-900"><UserPlus size={16} className="mr-2"/> Add Staff</Button>
                </DialogTrigger>
                <DialogContent className="rounded-2xl border-none max-w-md">
                  <DialogHeader><DialogTitle className="text-2xl font-bold">New Staff Account</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Full Name*</Label>
                      <Input value={newStaff.name} onChange={e => setNewStaff({...newStaff, name: e.target.value})} placeholder="e.g. John Doe" className="rounded-xl h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label>Email Address*</Label>
                      <Input type="email" value={newStaff.email} onChange={e => setNewStaff({...newStaff, email: e.target.value})} placeholder="john@example.com" className="rounded-xl h-11" />
                    </div>
                    <div className="space-y-2">
                      <Label>Password*</Label>
                      <Input type="password" value={newStaff.password} onChange={e => setNewStaff({...newStaff, password: e.target.value})} placeholder="Minimum 6 characters" className="rounded-xl h-11" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Role</Label>
                        <Select value={newStaff.role} onValueChange={v => setNewStaff({...newStaff, role: v})}>
                          <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="WAITER">Waiter</SelectItem>
                            <SelectItem value="KITCHEN">Kitchen Staff</SelectItem>
                            <SelectItem value="ADMIN">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {newStaff.role === 'KITCHEN' && (
                        <div className="space-y-2">
                          <Label>Assign Station</Label>
                          <Select value={newStaff.stationId} onValueChange={v => setNewStaff({...newStaff, stationId: v})}>
                            <SelectTrigger className="rounded-xl h-11"><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              {stations.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={addStaffMember} className="w-full bg-slate-900 rounded-xl h-14 font-bold text-lg">Create Account</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="p-4 text-left font-semibold">Staff Member</th>
                      <th className="p-4 text-left font-semibold">Role</th>
                      <th className="p-4 text-left font-semibold">Assignment</th>
                      <th className="p-4 text-right font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {users.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4">
                          <div className="font-medium text-slate-900">{staff.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{staff.email}</div>
                        </td>
                        <td className="p-4">
                          <Badge className={cn(
                            "px-2 py-0.5 text-[10px] border-none font-bold uppercase rounded-lg",
                            staff.role === 'ADMIN' ? "bg-purple-100 text-purple-700" :
                            staff.role === 'KITCHEN' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                          )}>
                            {staff.role}
                          </Badge>
                        </td>
                        <td className="p-4 text-slate-500 text-xs font-medium">
                          {staff.role === 'KITCHEN' ? (staff.station?.name || <span className="text-rose-400 italic">No Station</span>) : '-'}
                        </td>
                        <td className="p-4 text-right">
                          {user?.id !== staff.id && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-300 hover:text-red-500" onClick={() => deleteStaffMember(staff.id)}><Trash2 size={14}/></Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><History size={20}/> Operational Audit Logs</CardTitle>
              <CardDescription>Review system events and staff activity for accountability</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-4 text-left font-semibold">User</th>
                        <th className="p-4 text-left font-semibold">Action</th>
                        <th className="p-4 text-left font-semibold">Module</th>
                        <th className="p-4 text-left font-semibold">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-medium text-slate-900">
                            {log.user?.name || 'System'}
                            <span className="block text-[10px] text-slate-400 font-normal">{log.user?.email}</span>
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[10px] font-mono border-slate-200">{log.action}</Badge>
                          </td>
                          <td className="p-4 text-slate-500 uppercase text-[10px] font-bold tracking-wider">{log.module}</td>
                          <td className="p-4 text-slate-400 font-mono text-[10px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="print-history">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><PrinterIcon size={20}/> Print History</CardTitle>
              <CardDescription>Review all network print job attempts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 sticky top-0">
                      <tr>
                        <th className="p-4 text-left font-semibold">Timestamp</th>
                        <th className="p-4 text-left font-semibold">Printer</th>
                        <th className="p-4 text-left font-semibold">Type</th>
                        <th className="p-4 text-left font-semibold">Status</th>
                        <th className="p-4 text-left font-semibold">Content</th>
                        <th className="p-4 text-left font-semibold">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {printLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 text-slate-400 font-mono text-[10px]">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="p-4 font-medium text-slate-900">
                            {log.printer?.name || 'N/A'}
                          </td>
                          <td className="p-4">
                            <Badge variant="outline" className="text-[10px] font-mono border-slate-200">{log.type}</Badge>
                          </td>
                          <td className="p-4">
                            <Badge className={cn("text-[10px] font-bold uppercase", log.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}>
                              {log.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-slate-600 text-xs">{log.content}</td>
                          <td className="p-4 text-red-500 text-xs">{log.error || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
