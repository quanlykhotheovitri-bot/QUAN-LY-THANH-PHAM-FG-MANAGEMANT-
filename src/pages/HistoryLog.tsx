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
  User,
  Trash2
} from 'lucide-react';
import { formatDate } from '../lib/utils';

export default function HistoryLog() {
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [inboundData, setInboundData] = useState<any[]>([]);
  const [selectedInbound, setSelectedInbound] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [activeView, setActiveView] = useState<'movements' | 'inbound'>('movements');

  useEffect(() => {
    if (activeView === 'movements') {
      fetchLogs();
    } else {
      fetchInboundData();
    }
  }, [filter, activeView]);

  async function fetchLogs() {
    setLoading(true);
    let query = supabase
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter !== 'ALL') {
      query = query.eq('type', filter);
    }

    const { data } = await query;
    if (data) setLogs(data);
    setLoading(false);
  }

  async function fetchInboundData() {
    setLoading(true);
    const { data } = await supabase
      .from('inbound_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (data) setInboundData(data);
    setLoading(false);
  }

  const toggleSelectLog = (id: string) => {
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedLogs(newSelected);
  };

  const toggleSelectAllLogs = () => {
    if (selectedLogs.size === logs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(logs.map(log => log.id)));
    }
  };

  const deleteLog = async (id: string) => {
    const { error } = await supabase.from('inventory_movements').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi biến động.' });
      fetchLogs();
    }
  };

  const deleteSelectedLogs = async () => {
    if (selectedLogs.size === 0) return;
    
    const { error } = await supabase
      .from('inventory_movements')
      .delete()
      .in('id', Array.from(selectedLogs));

    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedLogs.size} bản ghi biến động.` });
      setSelectedLogs(new Set());
      fetchLogs();
    }
  };

  const toggleSelectInbound = (id: string) => {
    const newSelected = new Set(selectedInbound);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedInbound(newSelected);
  };

  const toggleSelectAllInbound = () => {
    if (selectedInbound.size === inboundData.length) {
      setSelectedInbound(new Set());
    } else {
      setSelectedInbound(new Set(inboundData.map(item => item.id)));
    }
  };

  const deleteInbound = async (id: string) => {
    const { error } = await supabase.from('inbound_transactions').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi nhập kho.' });
      fetchInboundData();
    }
  };

  const deleteSelectedInbound = async () => {
    if (selectedInbound.size === 0) return;
    
    const { error } = await supabase
      .from('inbound_transactions')
      .delete()
      .in('id', Array.from(selectedInbound));

    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedInbound.size} bản ghi nhập kho.` });
      setSelectedInbound(new Set());
      fetchInboundData();
    }
  };

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
          <h1 className="text-2xl font-bold text-slate-900">Lịch sử & Dữ liệu</h1>
          <p className="text-slate-500">Truy vết mọi biến động và dữ liệu nhập kho</p>
        </div>
        <div className="flex bg-white p-1 rounded-xl border border-slate-200 w-fit">
          <button
            onClick={() => setActiveView('movements')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeView === 'movements' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Biến động kho
          </button>
          <button
            onClick={() => setActiveView('inbound')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
              activeView === 'inbound' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            Data nhập kho
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          <History className="w-5 h-5" />
          <p className="text-sm font-medium">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase">Đóng</button>
        </div>
      )}

      {activeView === 'movements' ? (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 items-center justify-between">
            <div className="flex gap-2">
              {['ALL', 'INBOUND', 'OUTBOUND', 'TRANSFER'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    filter === f ? 'bg-blue-600 text-white shadow-lg shadow-blue-100' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {f === 'ALL' ? 'Tất cả' : f}
                </button>
              ))}
            </div>
            {selectedLogs.size > 0 && (
              <button
                onClick={deleteSelectedLogs}
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa đã chọn ({selectedLogs.size})
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-4 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedLogs.size === logs.length && logs.length > 0}
                        onChange={toggleSelectAllLogs}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
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
                      <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${selectedLogs.has(log.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-4 text-center">
                          <input 
                            type="checkbox" 
                            checked={selectedLogs.has(log.id)}
                            onChange={() => toggleSelectLog(log.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
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
                            {log.from_location && (
                              <span className="text-xs font-medium text-slate-500">{log.from_location}</span>
                            )}
                            {log.from_location && log.to_location && <ArrowRightIcon />}
                            {log.to_location && (
                              <span className="text-xs font-bold text-blue-600">{log.to_location}</span>
                            )}
                            <span className="ml-2 text-sm font-bold text-slate-900">x{log.quantity}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs text-slate-500 italic">{log.remark}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <button 
                            onClick={() => deleteLog(log.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Danh sách dữ liệu nhập kho</h2>
            {selectedInbound.size > 0 && (
              <button
                onClick={deleteSelectedInbound}
                className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Xóa đã chọn ({selectedInbound.size})
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-4 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedInbound.size === inboundData.length && inboundData.length > 0}
                      onChange={toggleSelectAllInbound}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thời gian</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Mã QR</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">SO / RPRO</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Số lượng</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vị trí</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thiết bị</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : inboundData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <ArrowDownLeft className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400">Chưa có dữ liệu nhập kho nào</p>
                    </td>
                  </tr>
                ) : (
                  inboundData.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedInbound.has(item.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedInbound.has(item.id)}
                          onChange={() => toggleSelectInbound(item.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <Calendar className="w-3 h-3" />
                          {formatDate(item.created_at)}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">{item.qr_code}</td>
                      <td className="px-6 py-4">
                        <div className="text-xs font-medium text-slate-600">{item.so}</div>
                        <div className="text-[10px] text-slate-400">{item.rpro}</div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-900">x{item.quantity}</td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold border border-blue-100">
                          {item.location_path}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 max-w-[150px] truncate">
                          <User className="w-3 h-3" />
                          {item.device_info}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <button 
                          onClick={() => deleteInbound(item.id)}
                          className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
