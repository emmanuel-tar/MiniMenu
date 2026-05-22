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
  Settings2
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

export default function Settings() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState<any[]>([]);
  const [newStation, setNewStation] = useState({ name: '', description: '' });
  const [printers, setPrinters] = useState<any[]>([]);
  const [newPrinter, setNewPrinter] = useState({
    name: '',
    type: 'BROWSER',
    ipAddress: '',
    port: '9100',
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
  const [company, setCompany] = useState({
    name: '',
    currency: 'USD',
    taxRate: 0,
    contactEmail: '',
    phone: '',
    address: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const compRes = await fetch('/api/company');
        const compData = await compRes.json();
        if (compData.name) setCompany(compData);

        const statRes = await fetch('/api/stations');
        const statData = await statRes.json();
        setStations(statData);

        const printRes = await fetch('/api/settings/printers', { 
          headers: { 'Authorization': `Bearer ${token}` } 
        });
        if (printRes.ok) setPrinters(await printRes.json());

        const receiptRes = await fetch('/api/settings/receipt');
        if (receiptRes.ok) {
          const rData = await receiptRes.json();
          if (rData.id) setReceiptSettings(rData);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchData();
  }, []);

  const saveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/company', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(company),
      });
      if (res.ok) {
        toast.success('Company settings updated');
      } else {
        toast.error('Failed to update settings');
      }
    } catch (err) {
      toast.error('Error saving data');
    } finally {
      setLoading(false);
    }
  };

  const addStation = async () => {
    if (!newStation.name) return;
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newStation),
      });
      if (res.ok) {
        const data = await res.json();
        setStations([...stations, data]);
        setNewStation({ name: '', description: '' });
        toast.success('Production station added');
      }
    } catch (err) {
      toast.error('Error adding station');
    }
  };

  const savePrinter = async () => {
    if (!newPrinter.name) return;
    try {
      const res = await fetch('/api/settings/printers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...newPrinter,
          port: parseInt(newPrinter.port)
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPrinters([...printers, data]);
        setNewPrinter({ name: '', type: 'BROWSER', ipAddress: '', port: '9100', role: 'CASHIER', stationId: '' });
        toast.success('Printer configured');
      }
    } catch (err) {
      toast.error('Failed to add printer');
    }
  };

  const saveReceiptSettings = async () => {
    try {
      const res = await fetch('/api/settings/receipt', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(receiptSettings),
      });
      if (res.ok) toast.success('Receipt design updated');
    } catch (err) {
      toast.error('Error saving receipt settings');
    }
  };

  return (
    <div className="max-w-5xl space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900">Settings</h2>
        <p className="text-slate-500">Configure your restaurant identity, preparation flow, and printing hardware</p>
      </div>

      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="bg-slate-100 p-1 rounded-xl mb-8">
          <TabsTrigger value="profile" className="rounded-lg gap-2"><Building2 size={16}/> Profile</TabsTrigger>
          <TabsTrigger value="stations" className="rounded-lg gap-2"><UtensilsCrossed size={16}/> Stations</TabsTrigger>
          <TabsTrigger value="printing" className="rounded-lg gap-2"><PrinterIcon size={16}/> Printing</TabsTrigger>
          <TabsTrigger value="receipt" className="rounded-lg gap-2"><ReceiptIcon size={16}/> Receipt Design</TabsTrigger>
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
                  <Input value={company.name} onChange={e => setCompany({...company, name: e.target.value})} placeholder="The Silver Grill" className="rounded-xl border-slate-200" />
                </div>
                <div className="space-y-2">
                  <Label>Currency Symbol</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input value={company.currency} onChange={e => setCompany({...company, currency: e.target.value})} className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Tax Rate (%)</Label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <Input type="number" value={company.taxRate} onChange={e => setCompany({...company, taxRate: parseFloat(e.target.value)})} className="pl-10 rounded-xl border-slate-200" />
                  </div>
                </div>
                <div className="md:col-span-2 pt-4">
                  <Button disabled={loading} className="px-8 bg-slate-900 rounded-xl h-12"><Save className="mr-2" size={18} /> Save Changes</Button>
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
                  <div key={station.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                    <h4 className="font-bold text-slate-900">{station.name}</h4>
                    <p className="text-xs text-slate-500 mt-1">{station.description || 'No description'}</p>
                  </div>
                ))}
                <div className="p-4 rounded-2xl border border-dashed border-slate-300 flex flex-col gap-3">
                  <Input placeholder="Station Name" value={newStation.name} onChange={e => setNewStation({...newStation, name: e.target.value})} className="h-8 text-xs border-none bg-white focus:ring-0" />
                  <Button size="sm" onClick={addStation} className="w-full text-xs rounded-lg"><Plus size={14} className="mr-1" /> Add Station</Button>
                </div>
              </div>
            </CardContent>
          </Card>
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
                      <Badge className="bg-emerald-50 text-emerald-600 border-none">Active</Badge>
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
      </Tabs>
    </div>
  );
}
