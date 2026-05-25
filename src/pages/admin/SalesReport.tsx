import React, { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  Calendar, 
  DollarSign, 
  Receipt,
  ArrowUpRight,
  BarChart3,
  LineChart as LineChartIcon
} from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { formatPrice, cn } from '@/src/lib/utils';

export default function SalesReport() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7); // Default to last 7 days
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({ startDate, endDate }).toString();
      const [reportRes, companyRes] = await Promise.all([
        fetch(`/api/admin/reports/daily-sales?${queryParams}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch('/api/company')
      ]);

      if (reportRes.ok) {
        const reportData = await reportRes.json();
        // Sort chronologically for the chart visualization
        setData([...reportData].sort((a, b) => a.date.localeCompare(b.date)));
      }
      if (companyRes.ok) setCompany(await companyRes.json());
    } catch (err) {
      console.error("Failed to fetch report data", err);
    } finally {
      setLoading(false);
    }
  }, [token, startDate, endDate]);

  useEffect(() => {
    if (token) fetchData();
  }, [token, fetchData]);

  const totals = data.reduce((acc, curr) => ({
    netSales: acc.netSales + curr.netSales,
    tax: acc.tax + curr.totalTax,
    serviceCharge: acc.serviceCharge + curr.totalServiceCharge,
  }), { netSales: 0, tax: 0, serviceCharge: 0 });

  if (loading) return <div className="p-8 text-center text-slate-500 animate-pulse">Generating report...</div>;

  return (
    <div className="space-y-8 pb-12">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-3">
          <TrendingUp className="text-slate-400" size={32} />
          Daily Sales Report
        </h2>
        <p className="text-slate-500">Comprehensive daily revenue, tax, and service charge breakdown</p>
      </div>

      {/* Date Range Picker */}
      <div className="flex flex-col md:flex-row gap-4 items-end bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="grid gap-2 flex-1 w-full">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Start Date</label>
          <input 
            type="date" 
            value={startDate} 
            onChange={(e) => setStartDate(e.target.value)}
            className="flex h-11 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
          />
        </div>
        <div className="grid gap-2 flex-1 w-full">
          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">End Date</label>
          <input 
            type="date" 
            value={endDate} 
            onChange={(e) => setEndDate(e.target.value)}
            className="flex h-11 w-full rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
          />
        </div>
        <Button onClick={fetchData} className="h-11 rounded-xl px-8 bg-slate-900 font-bold w-full md:w-auto">
          Update Report
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Net Sales</CardTitle>
            <div className="bg-emerald-50 p-2 rounded-lg">
              <DollarSign className="text-emerald-600" size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatPrice(totals.netSales, company?.currency).primary}
            </div>
            <p className="text-xs text-slate-400 mt-1">Excludes taxes and charges</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total VAT Collected</CardTitle>
            <div className="bg-blue-50 p-2 rounded-lg">
              <Receipt className="text-blue-600" size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatPrice(totals.tax, company?.currency).primary}
            </div>
            <p className="text-xs text-slate-400 mt-1">Accumulated value added tax</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm rounded-3xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Service Charges</CardTitle>
            <div className="bg-amber-50 p-2 rounded-lg">
              <ArrowUpRight className="text-amber-600" size={18} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatPrice(totals.serviceCharge, company?.currency).primary}
            </div>
            <p className="text-xs text-slate-400 mt-1">Total hospitality service fees</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm rounded-3xl overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calendar size={20} className="text-slate-400" />
              Revenue Timeline
            </CardTitle>
            <CardDescription>Daily comparison of income streams</CardDescription>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-8 w-10 rounded-lg p-0", 
                chartType === 'bar' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
              )}
              onClick={() => setChartType('bar')}
            >
              <BarChart3 size={16} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn(
                "h-8 w-10 rounded-lg p-0", 
                chartType === 'line' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900"
              )}
              onClick={() => setChartType('line')}
            >
              <LineChartIcon size={16} />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="h-[400px] pt-4">
          <ResponsiveContainer width="100%" height="100%">
            {chartType === 'bar' ? (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${company?.currency || ''}${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px' }} />
                <Bar name="Net Sales" dataKey="netSales" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar name="VAT" dataKey="totalTax" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar name="Service Charge" dataKey="totalServiceCharge" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            ) : (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  tickFormatter={(value) => `${company?.currency || ''}${value >= 1000 ? (value/1000).toFixed(0) + 'k' : value}`}
                />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px' }} />
                <Line 
                  type="monotone"
                  name="Net Sales" dataKey="netSales" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 6, strokeWidth: 0 }} 
                />
                <Line 
                  type="monotone"
                  name="VAT" dataKey="totalTax" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 6, strokeWidth: 0 }} 
                />
                <Line 
                  type="monotone"
                  name="Service Charge" dataKey="totalServiceCharge" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b', strokeWidth: 2, stroke: '#fff' }} 
                  activeDot={{ r: 6, strokeWidth: 0 }} 
                />
              </LineChart>
            )}
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}