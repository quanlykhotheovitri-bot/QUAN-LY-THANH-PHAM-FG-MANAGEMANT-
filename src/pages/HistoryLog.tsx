import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  History, 
  Search, 
  Filter, 
  Calendar,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  User
} from 'lucide-react';
import { formatDate } from '../lib/utils';

export default function HistoryLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  async function fetchLogs() {
    setLoading(true);
    let query = supabase
      .from('inventory_movements')
      .select('*, from_loc:warehouse_locations!from_location_id(full_path), to_loc:warehouse_locations!to_location_id(full_path)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'ALL') {
      query = query.eq('type', filter);
    }

    const { data } = await query;
    if (data) setLogs(data);
    setLoading(false);
  }

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'INBOUND': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'OUTBOUND': return 'bg-orange-50 text-orange-600 border-orange-100';
      case 'TRANSFER': return 'bg-blue-50 text-blue-600 border-blue-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'INBOUND': return <ArrowDownLeft className="w-4 h-4" />;
      case 'OUTBOUND': return <ArrowUpRight className="w-4 h-4" />;
      case 'TRANSFER': return <RefreshCw className="w-4 h-4" />;
      default: return <History className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lịch sử thao tác</h1>
          <p className="text-slate-500">Truy vết mọi biến động trong kho hàng</p>
        </div>
        <div className="flex gap-2">
          {['ALL', 'INBOUND', 'OUTBOUND', 'TRANSFER'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                filter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f === 'ALL' ? 'Tất cả' : f}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thời gian</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Loại</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mã QR / Hàng hóa</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Biến động</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400">Chưa có lịch sử thao tác nào</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-slate-600">
                        <Calendar className="w-3 h-3" />
                        {formatDate(log.created_at)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border ${getTypeStyle(log.type)}`}>
                        {getTypeIcon(log.type)}
                        {log.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{log.qr_code}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {log.from_loc && (
                          <span className="text-xs font-medium text-slate-500">{log.from_loc.full_path}</span>
                        )}
                        {log.from_loc && log.to_loc && <ArrowRightIcon />}
                        {log.to_loc && (
                          <span className="text-xs font-bold text-blue-600">{log.to_loc.full_path}</span>
                        )}
                        <span className="ml-2 text-sm font-bold text-slate-900">x{log.quantity}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500 italic">{log.remark}</span>
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

function ArrowRightIcon() {
  return (
    <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}
