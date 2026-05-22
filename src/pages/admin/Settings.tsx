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
  UtensilsCrossed
} from 'lucide-react';

export default function Settings() {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [stations, setStations] = useState([]);
  const [newStation, setNewStation] = useState({ name: '', description: '' });
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

  return (
    <div className="max-w-4xl space-y-8">
      {/* Company Profile */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Building2 className="text-slate-400" size={20} />
            Restaurant Profile
          </CardTitle>
          <CardDescription>Setup your basic restaurant identity and financial settings</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveCompany} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Restaurant Name</Label>
              <Input 
                value={company.name} 
                onChange={e => setCompany({...company, name: e.target.value})} 
                placeholder="The Silver Grill"
                className="rounded-xl border-slate-200"
              />
            </div>
            <div className="space-y-2">
              <Label>Currency Symbol</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input 
                  value={company.currency} 
                  onChange={e => setCompany({...company, currency: e.target.value})} 
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Tax Rate (%)</Label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input 
                  type="number"
                  value={company.taxRate} 
                  onChange={e => setCompany({...company, taxRate: parseFloat(e.target.value)})} 
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contact Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input 
                  value={company.contactEmail} 
                  onChange={e => setCompany({...company, contactEmail: e.target.value})} 
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Contact Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input 
                  value={company.phone} 
                  onChange={e => setCompany({...company, phone: e.target.value})} 
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 text-slate-400" size={16} />
                <Input 
                  value={company.address} 
                  onChange={e => setCompany({...company, address: e.target.value})} 
                  className="pl-10 rounded-xl border-slate-200"
                />
              </div>
            </div>
            <div className="md:col-span-2 pt-4">
              <Button disabled={loading} className="w-full md:w-auto px-8 bg-slate-900 rounded-xl py-6">
                <Save className="mr-2" size={18} />
                Save Changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Production Stations */}
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <UtensilsCrossed className="text-slate-400" size={20} />
            Production Stations
          </CardTitle>
          <CardDescription>Configure physical locations where food/drinks are prepared</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stations.map((station) => (
              <div key={station.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50">
                <h4 className="font-bold text-slate-900">{station.name}</h4>
                <p className="text-xs text-slate-500 mt-1">{station.description || 'No description'}</p>
              </div>
            ))}
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 flex flex-col gap-3">
              <Input 
                placeholder="Station Name" 
                value={newStation.name}
                onChange={e => setNewStation({...newStation, name: e.target.value})}
                className="h-8 text-xs border-none bg-white focus:ring-0"
              />
              <Button size="sm" onClick={addStation} className="w-full text-xs rounded-lg">
                <Plus size={14} className="mr-1" /> Add Station
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
