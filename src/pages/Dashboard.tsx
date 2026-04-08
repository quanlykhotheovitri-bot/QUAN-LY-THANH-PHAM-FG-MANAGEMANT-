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
  });
  const [agingData, setAgingData] = useState<any[]>([]);
  const [slowMovingSOs, setSlowMovingSOs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      // Total Inventory
      const { data: inventory, error: invError } = await supabase
        .from('inventory_balances')
        .select('so, rpro, quantity, last_updated, location_path, qr_code');
      
      if (invError) throw invError;
      
      const invOrders = new Set(inventory?.map(item => `${item.so}|${item.rpro}`));
      const invTotalBoxes = inventory?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Today's Inbound
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: inbound, error: inError } = await supabase
        .from('inbound_transactions')
        .select('so, rpro, quantity')
        .gte('created_at', today.toISOString());
      
      if (inError) throw inError;
      
      const inOrders = new Set(inbound?.map(item => `${item.so}|${item.rpro}`));
      const inTotalBoxes = inbound?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Today's Outbound
      const { data: outbound, error: outError } = await supabase
        .from('outbound_transactions')
        .select('so, rpro, quantity')
        .gte('created_at', today.toISOString());
      
      if (outError) throw outError;
      
      const outOrders = new Set(outbound?.map(item => `${item.so}|${item.rpro}`));
      const outTotalBoxes = outbound?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;

      // Aging Calculation
      const now = new Date();
      const agingGroups = [
        { name: 'Dưới 10 ngày', min: 0, max: 10, quantity: 0 as number, soSet: new Set<string>() },
        { name: '11-20 ngày', min: 11, max: 20, quantity: 0 as number, soSet: new Set<string>() },
        { name: '21-30 ngày', min: 21, max: 30, quantity: 0 as number, soSet: new Set<string>() },
        { name: '31-60 ngày', min: 31, max: 60, quantity: 0 as number, soSet: new Set<string>() },
        { name: '61-90 ngày', min: 61, max: 90, quantity: 0 as number, soSet: new Set<string>() },
        { name: 'Trên 90 ngày', min: 91, max: 99999, quantity: 0 as number, soSet: new Set<string>() },
      ];

      const soAgingMap: Record<string, { quantity: number, maxAge: number, items: any[] }> = {};

      inventory?.forEach(item => {
        const entryDate = new Date(item.last_updated);
        const diffDays = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 3600 * 24));
        
        const group = agingGroups.find(g => diffDays >= g.min && diffDays <= g.max);
        if (group) {
          group.quantity += (item.quantity || 0);
          if (item.so) group.soSet.add(item.so);
        }

        // Group by SO for the detail table
        if (item.so) {
          if (!soAgingMap[item.so]) {
            soAgingMap[item.so] = { quantity: 0, maxAge: 0, items: [] };
          }
          soAgingMap[item.so].quantity += (item.quantity || 0);
          soAgingMap[item.so].maxAge = Math.max(soAgingMap[item.so].maxAge, diffDays);
          soAgingMap[item.so].items.push(item);
        }
      });

      const formattedAgingData = agingGroups.map(g => ({
        name: g.name,
        quantity: g.quantity,
        sos: g.soSet.size
      }));

      // Filter SOs that are "slow moving" (e.g. > 30 days) for the table
      const slowSOs = Object.entries(soAgingMap)
        .filter(([_, data]) => data.maxAge > 30)
        .map(([so, data]) => ({
          so,
          quantity: data.quantity,
          age: data.maxAge,
          lastItem: data.items[0] // For display purposes
        }))
        .sort((a, b) => b.age - a.age);

      setStats({
        totalInventory: { orders: invOrders.size, boxes: invTotalBoxes },
        todayInbound: { orders: inOrders.size, boxes: inTotalBoxes },
        todayOutbound: { orders: outOrders.size, boxes: outTotalBoxes },
      });
      setAgingData(formattedAgingData);
      setSlowMovingSOs(slowSOs);
    } catch (err: any) {
      console.error('Error fetching dashboard stats:', err);
      const errorMsg = err.message?.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : err.message || 'Không thể tải dữ liệu Dashboard';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  const StatCard = ({ title, value, icon: Icon, color, trend, isDual }: any) => {
    const getBgColor = () => {
      if (color.includes('blue')) return 'bg-blue-50 border-blue-400';
      if (color.includes('emerald')) return 'bg-emerald-50 border-emerald-400';
      if (color.includes('orange')) return 'bg-orange-50 border-orange-400';
      if (color.includes('rose')) return 'bg-rose-50 border-rose-400';
      return 'bg-white border-slate-300';
    };

    return (
      <motion.div 
        whileHover={{ y: -5, scale: 1.02 }}
        className={`p-6 rounded-2xl border-2 shadow-md transition-all ${getBgColor()}`}
      >
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-xl shadow-sm ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {trend && (
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${trend > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
              {trend > 0 ? '+' : ''}{trend}%
            </span>
          )}
        </div>
        <h3 className="text-slate-600 text-sm font-bold uppercase tracking-tight">{title}</h3>
        {isDual ? (
          <div className="mt-2 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tighter">{value.orders.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 font-black uppercase">Đơn hàng</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-blue-600 tracking-tighter">{value.boxes.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 font-black uppercase">Tổng thùng</span>
            </div>
          </div>
        ) : (
          <p className="text-3xl font-black text-slate-900 mt-2 tracking-tighter">{value.toLocaleString()}</p>
        )}
      </motion.div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-50 border border-rose-200 p-6 rounded-2xl text-center">
        <AlertTriangle className="w-12 h-12 text-rose-600 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-rose-900 mb-2">Lỗi tải dữ liệu</h2>
        <p className="text-rose-700 mb-6">{error}</p>
        <button 
          onClick={fetchStats}
          className="px-6 py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-all"
        >
          Thử lại
        </button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <StatCard title="Tổng tồn kho" value={stats.totalInventory} icon={Package} color="bg-blue-600" isDual />
        <StatCard title="Nhập kho hôm nay" value={stats.todayInbound} icon={TrendingUp} color="bg-emerald-600" isDual />
        <StatCard title="Xuất kho hôm nay" value={stats.todayOutbound} icon={TrendingDown} color="bg-orange-600" isDual />
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* Inventory Aging Analysis */}
        <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
          <div className="flex items-center gap-2 mb-6 bg-blue-600 p-3 rounded-xl shadow-md">
            <BarChart3 className="w-5 h-5 text-white" />
            <h2 className="text-lg font-bold text-white tracking-tight">Phân tích tuổi hàng tồn kho (Aging)</h2>
          </div>
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Bar dataKey="quantity" name="Số lượng thùng" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={60} />
                <Bar dataKey="sos" name="Số lượng SO" fill="#10b981" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Slow Moving SOs Table */}
      <div className="bg-white p-6 rounded-2xl border-2 border-rose-500 shadow-lg">
        <div className="flex items-center gap-2 mb-6 bg-rose-600 p-3 rounded-xl shadow-md">
          <AlertTriangle className="w-5 h-5 text-white" />
          <h2 className="text-lg font-bold text-white tracking-tight">Chi tiết SO chậm luân chuyển (Trên 30 ngày)</h2>
        </div>
        <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Đơn hàng SO</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Sản phẩm tiêu biểu</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">Tổng số lượng</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-center">Số ngày tồn</th>
                <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Ngày nhập sớm nhất</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slowMovingSOs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-sm italic">
                    Không có đơn hàng SO chậm luân chuyển
                  </td>
                </tr>
              ) : (
                slowMovingSOs.map(item => (
                  <tr key={item.so} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm font-bold text-blue-600">{item.so}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{item.lastItem?.rpro || 'N/A'}</td>
                    <td className="px-4 py-3 text-sm text-center font-bold">{item.quantity}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        item.age > 90 ? 'bg-rose-100 text-rose-600' : 
                        item.age > 60 ? 'bg-orange-100 text-orange-600' : 
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {item.age} ngày
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 text-right">
                      {new Date(item.lastItem?.last_updated).toLocaleDateString('vi-VN')}
                    </td>
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
