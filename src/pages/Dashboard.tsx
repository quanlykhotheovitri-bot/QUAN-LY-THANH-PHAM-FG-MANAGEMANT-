import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Package, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  BarChart3,
  PieChart as PieChartIcon,
  MapPin
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { motion } from 'motion/react';

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalInventory: { orders: 0, boxes: 0 },
    todayInbound: { orders: 0, boxes: 0 },
    todayOutbound: { orders: 0, boxes: 0 },
    lowStock: 0,
  });
  const [locationData, setLocationData] = useState<any[]>([]);
  const [customerData, setCustomerData] = useState<any[]>([]);
  const [slowMoving, setSlowMoving] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    try {
      // Total Inventory
      const { data: inventory } = await supabase
        .from('inventory_balances')
        .select('so, rpro, quantity');
      
      const invOrders = new Set(inventory?.map(item => `${item.so}|${item.rpro}`));
      const invTotalBoxes = inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Today's Inbound
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: inbound } = await supabase
        .from('inbound_transactions')
        .select('so, rpro, quantity')
        .gte('created_at', today.toISOString());
      
      const inOrders = new Set(inbound?.map(item => `${item.so}|${item.rpro}`));
      const inTotalBoxes = inbound?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Today's Outbound
      const { data: outbound } = await supabase
        .from('outbound_transactions')
        .select('so, rpro, quantity')
        .gte('created_at', today.toISOString());
      
      const outOrders = new Set(outbound?.map(item => `${item.so}|${item.rpro}`));
      const outTotalBoxes = outbound?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Inventory by Location
      const { data: locData } = await supabase
        .from('inventory_balances')
        .select('quantity, warehouse_locations(zone)');
      
      const locMap: Record<string, number> = {};
      locData?.forEach((item: any) => {
        const zone = item.warehouse_locations?.zone || 'Unknown';
        locMap[zone] = (locMap[zone] || 0) + item.quantity;
      });
      
      const formattedLocData = Object.entries(locMap).map(([name, value]) => ({ name, value }));

      // Inventory by Customer
      const { data: custData } = await supabase
        .from('inventory_balances')
        .select('quantity, kh');
      
      const custMap: Record<string, number> = {};
      custData?.forEach(item => {
        const kh = item.kh || 'General';
        custMap[kh] = (custMap[kh] || 0) + item.quantity;
      });
      
      const formattedCustData = Object.entries(custMap).map(([name, value]) => ({ name, value }));

      // Slow Moving Items (Last updated > 30 days ago)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { data: slowData } = await supabase
        .from('inventory_balances')
        .select('*, warehouse_locations(full_path)')
        .lt('last_updated', thirtyDaysAgo.toISOString())
        .limit(5);
      
      setSlowMoving(slowData || []);

      setStats({
        totalInventory: { orders: invOrders.size, boxes: invTotalBoxes },
        todayInbound: { orders: inOrders.size, boxes: inTotalBoxes },
        todayOutbound: { orders: outOrders.size, boxes: outTotalBoxes },
        lowStock: slowData?.length || 0,
      });
      setLocationData(formattedLocData);
      setCustomerData(formattedCustData);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const StatCard = ({ title, value, icon: Icon, color, trend, isDual }: any) => (
    <motion.div 
      whileHover={{ y: -5 }}
      className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
    >
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-xl ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <h3 className="text-slate-500 text-sm font-medium">{title}</h3>
      {isDual ? (
        <div className="mt-1 space-y-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{value.orders.toLocaleString()}</span>
            <span className="text-xs text-slate-400 font-medium">ĐƠN</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-blue-600">{value.boxes.toLocaleString()}</span>
            <span className="text-xs text-slate-400 font-medium">THÙNG</span>
          </div>
        </div>
      ) : (
        <p className="text-2xl font-bold text-slate-900 mt-1">{value.toLocaleString()}</p>
      )}
    </motion.div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan kho hàng</h1>
          <p className="text-slate-500">Dữ liệu cập nhật thời gian thực</p>
        </div>
        <button 
          onClick={fetchStats}
          className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
        >
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Tổng tồn kho" value={stats.totalInventory} icon={Package} color="bg-blue-600" isDual />
        <StatCard title="Nhập kho hôm nay" value={stats.todayInbound} icon={TrendingUp} color="bg-emerald-600" isDual />
        <StatCard title="Xuất kho hôm nay" value={stats.todayOutbound} icon={TrendingDown} color="bg-orange-600" isDual />
        <StatCard title="Cảnh báo tồn" value={stats.lowStock} icon={AlertTriangle} color="bg-rose-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Inventory by Location */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Tồn kho theo Zone</h2>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={locationData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory by Customer */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Tồn theo khách hàng</h2>
          </div>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={customerData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {customerData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            {customerData.map((entry, index) => (
              <div key={entry.name} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                <span className="text-xs text-slate-600 truncate">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slow Moving Items Table */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <AlertTriangle className="w-5 h-5 text-rose-600" />
          <h2 className="text-lg font-bold text-slate-900">Hàng chậm luân chuyển (Trên 30 ngày)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Mã QR</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Hàng hóa</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Vị trí</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">Số lượng</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Cập nhật cuối</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slowMoving.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm italic">
                    Không có hàng chậm luân chuyển
                  </td>
                </tr>
              ) : (
                slowMoving.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{item.qr_code}</td>
                    <td className="px-4 py-3 text-sm font-bold text-slate-900">{item.rpro || item.so}</td>
                    <td className="px-4 py-3 text-xs text-blue-600 font-bold">{item.warehouse_locations?.full_path}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold">{item.quantity}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">{new Date(item.last_updated).toLocaleDateString('vi-VN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
