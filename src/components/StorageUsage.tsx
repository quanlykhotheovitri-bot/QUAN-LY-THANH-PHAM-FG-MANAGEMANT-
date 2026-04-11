import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Database, AlertTriangle, Info } from 'lucide-react';
import { motion } from 'motion/react';
import DataArchiver from './DataArchiver';

export default function StorageUsage() {
  const [usage, setUsage] = useState<{
    percentage: number;
    totalRows: number;
    status: 'normal' | 'warning' | 'critical';
  }>({ percentage: 0, totalRows: 0, status: 'normal' });
  const [loading, setLoading] = useState(true);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [hasWarned, setHasWarned] = useState(false);

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

  const fetchUsage = async () => {
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
      
      // Simulation: 1,000 rows ≈ 0.01 MB
      // 500,000 rows ≈ 5.00 MB (Limit)
      const MB_LIMIT = 5.00;
      const usedMB = (totalRows * 0.00001); // 100k rows = 1MB
      const percentage = Math.min(100, (usedMB / MB_LIMIT) * 100);
      
      let status: 'normal' | 'warning' | 'critical' = 'normal';
      if (percentage > 90) status = 'critical';
      else if (percentage > 70) status = 'warning';

      // Auto-trigger warning at 80%
      if (percentage >= 80 && !hasWarned) {
        setIsArchiveOpen(true);
        setHasWarned(true);
      }

      setUsage({ percentage, totalRows: usedMB, status });
    } catch (error) {
      console.error('Error fetching storage usage:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClearCache = () => {
    // Clear local storage and session storage
    localStorage.clear();
    sessionStorage.clear();
    alert('Đã xóa bộ nhớ đệm thành công!');
    window.location.reload();
  };

  if (loading) return null;

  return (
    <div className="px-4 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold uppercase tracking-tight text-slate-500">DUNG LƯỢNG LƯU TRỮ</span>
        <span className="text-[11px] font-black text-slate-900">
          {Math.round(usage.percentage)}%
        </span>
      </div>
      
      <div className="w-full bg-slate-100 rounded-full h-2 mb-2 overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${usage.percentage}%` }}
          className={`h-full rounded-full ${usage.percentage >= 80 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400 italic font-medium">
          Đã dùng {usage.totalRows.toFixed(2)} MB / 5.00 MB
        </span>
        <div className="flex items-center gap-3">
          {usage.percentage >= 80 && (
            <button 
              onClick={() => setIsArchiveOpen(true)}
              className="text-[10px] font-black text-rose-600 hover:text-rose-700 uppercase tracking-tight flex items-center gap-1"
            >
              <AlertTriangle className="w-3 h-3" />
              SAO LƯU
            </button>
          )}
          <button 
            onClick={handleClearCache}
            className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-tight"
          >
            XÓA ĐỆM
          </button>
        </div>
      </div>

      <DataArchiver 
        isOpen={isArchiveOpen} 
        onClose={() => setIsArchiveOpen(false)}
        onSuccess={() => {
          fetchUsage();
          setHasWarned(false);
        }}
      />
    </div>
  );
}
