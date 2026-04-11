import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertTriangle, Info } from 'lucide-react';
import { motion } from 'motion/react';

export default function StorageUsage() {
  const [usage, setUsage] = useState<{
    percentage: number;
    totalRows: number;
    status: 'normal' | 'warning' | 'critical';
  }>({ percentage: 0, totalRows: 0, status: 'normal' });
  const [loading, setLoading] = useState(true);

  // Supabase Free Tier limits are roughly 500MB.
  // We estimate row size to be around 0.5KB on average (including indexes).
  // 500MB / 0.5KB = 1,000,000 rows limit for estimation.
  const ROW_LIMIT_ESTIMATE = 1000000;

  useEffect(() => {
    fetchUsage();
    // Refresh every 5 minutes
    const interval = setInterval(fetchUsage, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchUsage() {
    try {
      // Count rows in main tables
      const [
        { count: inventoryCount },
        { count: inboundCount },
        { count: outboundCount },
        { count: sourceCount }
      ] = await Promise.all([
        supabase.from('inventory_balances').select('*', { count: 'exact', head: true }),
        supabase.from('inbound_transactions').select('*', { count: 'exact', head: true }),
        supabase.from('outbound_transactions').select('*', { count: 'exact', head: true }),
        supabase.from('source_import_lines').select('*', { count: 'exact', head: true })
      ]);

      const totalRows = (inventoryCount || 0) + (inboundCount || 0) + (outboundCount || 0) + (sourceCount || 0);
      const percentage = Math.min(100, (totalRows / ROW_LIMIT_ESTIMATE) * 100);
      
      let status: 'normal' | 'warning' | 'critical' = 'normal';
      if (percentage > 90) status = 'critical';
      else if (percentage > 70) status = 'warning';

      setUsage({ percentage, totalRows, status });
    } catch (error) {
      console.error('Error fetching storage usage:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) return null;

  const getStatusColor = () => {
    switch (usage.status) {
      case 'critical': return 'bg-rose-500';
      case 'warning': return 'bg-amber-500';
      default: return 'bg-blue-500';
    }
  };

  const getStatusTextColor = () => {
    switch (usage.status) {
      case 'critical': return 'text-rose-600';
      case 'warning': return 'text-amber-600';
      default: return 'text-blue-600';
    }
  };

  const getStatusBgColor = () => {
    switch (usage.status) {
      case 'critical': return 'bg-rose-50';
      case 'warning': return 'bg-amber-50';
      default: return 'bg-blue-50';
    }
  };

  return (
    <div className={`p-4 rounded-xl border border-slate-100 ${getStatusBgColor()} transition-all`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Database className={`w-3.5 h-3.5 ${getStatusTextColor()}`} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Dung lượng dữ liệu</span>
        </div>
        <span className={`text-[10px] font-black ${getStatusTextColor()}`}>
          {usage.percentage.toFixed(1)}%
        </span>
      </div>
      
      <div className="w-full bg-slate-200 rounded-full h-1.5 mb-2 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${usage.percentage}%` }}
          className={`h-full rounded-full ${getStatusColor()}`}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-400 font-medium">
          {usage.totalRows.toLocaleString()} / {ROW_LIMIT_ESTIMATE.toLocaleString()} dòng
        </span>
        {usage.status !== 'normal' && (
          <div className="flex items-center gap-1">
            <AlertTriangle className={`w-3 h-3 ${getStatusTextColor()}`} />
            <span className={`text-[9px] font-bold ${getStatusTextColor()}`}>
              {usage.status === 'critical' ? 'Sắp đầy!' : 'Cảnh báo'}
            </span>
          </div>
        )}
      </div>
      
      {usage.status === 'critical' && (
        <p className="text-[8px] text-rose-500 mt-2 leading-tight font-medium">
          Dữ liệu đã gần đạt giới hạn. Vui lòng xóa bớt lịch sử cũ hoặc nâng cấp gói Supabase.
        </p>
      )}
    </div>
  );
}
