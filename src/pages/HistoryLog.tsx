import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLoading } from '../contexts/LoadingContext';
import { 
  History as HistoryIcon, 
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
  const { user } = useAuth();
  const { setIsLoading } = useLoading();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const [logs, setLogs] = useState<any[]>([]);
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [inboundData, setInboundData] = useState<any[]>([]);
  const [selectedInbound, setSelectedInbound] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [filter, setFilter] = useState('ALL');
  const [activeView, setActiveView] = useState<'movements' | 'inbound'>('movements');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(5000);

  useEffect(() => {
    if (activeView === 'movements') {
      fetchLogs();
    } else {
      fetchInboundData();
    }
  }, [filter, activeView, pageSize, searchTerm]);

  async function fetchLogs() {
    setLoading(true);
    setIsLoading(true);

    let query = supabase
      .from('inventory_movements')
      .select('*', { count: 'exact' });

    if (filter !== 'ALL') {
      query = query.eq('type', filter);
    }

    if (searchTerm) {
      query = query.ilike('qr_code', `%${searchTerm}%`);
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (data) setLogs(data);
    if (count !== null) setTotalCount(count);
    setLoading(false);
    setIsLoading(false);
  }

  async function fetchInboundData() {
    setLoading(true);
    setIsLoading(true);

    let query = supabase
      .from('inbound_transactions')
      .select('*', { count: 'exact' });

    if (searchTerm) {
      query = query.or(`qr_code.ilike.%${searchTerm}%,so.ilike.%${searchTerm}%,rpro.ilike.%${searchTerm}%`);
    }

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .limit(pageSize);
    
    if (data) setInboundData(data);
    if (count !== null) setTotalCount(count);
    setLoading(false);
    setIsLoading(false);
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
    if (selectedLogs.size === filteredLogs.length && filteredLogs.length > 0) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(filteredLogs.map(log => log.id)));
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
    if (selectedInbound.size === filteredInbound.length && filteredInbound.length > 0) {
      setSelectedInbound(new Set());
    } else {
      setSelectedInbound(new Set(filteredInbound.map(item => item.id)));
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

  const deleteAllLogs = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa TẤT CẢ bản ghi biến động kho?')) return;
    setLoading(true);
    setIsLoading(true);
    const { error } = await supabase.from('inventory_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa tất cả: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa tất cả bản ghi biến động kho.' });
      fetchLogs();
    }
    setLoading(false);
    setIsLoading(false);
  };

  const deleteAllInbound = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa TẤT CẢ bản ghi nhập kho?')) return;
    setLoading(true);
    setIsLoading(true);
    const { error } = await supabase.from('inbound_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa tất cả: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa tất cả bản ghi nhập kho.' });
      fetchInboundData();
    }
    setLoading(false);
    setIsLoading(false);
  };

  const filteredLogs = logs;

  const filteredInbound = inboundData;

  const PaginationUI = () => (
    <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t-2 border-slate-200">
      <div className="text-xs font-black text-slate-500 uppercase tracking-widest">
        Hiển thị: <span className="text-blue-600">{activeView === 'movements' ? logs.length : inboundData.length}</span> / {totalCount} bản ghi mới nhất
      </div>
      <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border-2 border-slate-200">
        <span className="text-[10px] font-black text-slate-400 uppercase">Giới hạn:</span>
        <select 
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
          className="bg-transparent font-black text-blue-600 outline-none text-sm cursor-pointer"
        >
          <option value={50}>50</option>
          <option value={100}>100</option>
          <option value={500}>500</option>
          <option value={1000}>1,000</option>
          <option value={5000}>5,000</option>
        </select>
      </div>
    </div>
  );

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
      default: return <HistoryIcon className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-8">
      <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-3 bg-blue-600 p-3 rounded-xl shadow-md">
            <HistoryIcon className="w-6 h-6 text-white" />
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight leading-none">Lịch sử & Dữ liệu</h1>
              <p className="text-blue-100 text-[10px] uppercase font-bold tracking-widest mt-1">Truy vết mọi biến động và dữ liệu nhập kho</p>
            </div>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-xl border-2 border-slate-200 w-fit shadow-inner">
            <button
              onClick={() => setActiveView('movements')}
              className={`px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
                activeView === 'movements'
                  ? 'bg-white text-blue-600 shadow-md scale-105'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              BIẾN ĐỘNG KHO
            </button>
            <button
              onClick={() => setActiveView('inbound')}
              className={`px-6 py-2.5 rounded-lg text-sm font-black transition-all ${
                activeView === 'inbound'
                  ? 'bg-white text-blue-600 shadow-md scale-105'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              DỮ LIỆU NHẬP
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 shadow-lg border-2 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
        }`}>
          <HistoryIcon className="w-5 h-5" />
          <p className="text-sm font-black uppercase tracking-wider">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-black bg-white px-3 py-1 rounded-lg shadow-sm border border-slate-200">ĐÓNG</button>
        </div>
      )}

      {activeView === 'movements' ? (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-2">
                {['ALL', 'INBOUND', 'OUTBOUND', 'TRANSFER'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all border-2 ${
                      filter === f ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {f === 'ALL' ? 'TẤT CẢ' : f}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm SO, RPRO, QR..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-500 focus:ring-0 transition-all w-64"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  onClick={deleteAllLogs}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  XÓA TẤT CẢ
                </button>
              )}
              {isAdmin && selectedLogs.size > 0 && (
                <button
                  onClick={deleteSelectedLogs}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-all border-2 border-rose-200 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  XÓA ĐÃ CHỌN ({selectedLogs.size})
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-slate-50 p-4 border-b-2 border-slate-200">
              <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Danh sách biến động kho</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-4 text-center">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedLogs.size === filteredLogs.length && filteredLogs.length > 0}
                          onChange={toggleSelectAllLogs}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
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
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center">
                        <HistoryIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400">Chưa có lịch sử thao tác nào</p>
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className={`hover:bg-slate-50 transition-colors ${selectedLogs.has(log.id) ? 'bg-blue-50' : ''}`}>
                        <td className="px-4 py-4 text-center">
                          {isAdmin && (
                            <input 
                              type="checkbox" 
                              checked={selectedLogs.has(log.id)}
                              onChange={() => toggleSelectLog(log.id)}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          )}
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
                          {isAdmin && (
                            <button 
                              onClick={() => deleteLog(log.id)}
                              className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationUI />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex flex-wrap gap-4 items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-slate-400" />
                <span className="text-sm font-black text-slate-600 uppercase tracking-wider">Thao tác dữ liệu</span>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm SO, RPRO, QR..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs focus:border-blue-500 focus:ring-0 transition-all w-64"
                />
              </div>
            </div>
            <div className="flex gap-2">
              {isAdmin && (
                <button
                  onClick={deleteAllInbound}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-black hover:bg-rose-700 transition-all shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  XÓA TẤT CẢ
                </button>
              )}
              {isAdmin && selectedInbound.size > 0 && (
                <button
                  onClick={deleteSelectedInbound}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-xs font-black hover:bg-rose-100 transition-all border-2 border-rose-200 shadow-sm"
                >
                  <Trash2 className="w-4 h-4" />
                  XÓA ĐÃ CHỌN ({selectedInbound.size})
                </button>
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
            <div className="bg-slate-50 p-4 border-b-2 border-slate-200">
              <h2 className="text-sm font-black text-slate-600 uppercase tracking-widest">Danh sách dữ liệu nhập kho</h2>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-4 text-center">
                    {isAdmin && (
                      <input 
                        type="checkbox" 
                        checked={selectedInbound.size === filteredInbound.length && filteredInbound.length > 0}
                        onChange={toggleSelectAllInbound}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    )}
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
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredInbound.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center">
                      <ArrowDownLeft className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400">Chưa có dữ liệu nhập kho nào</p>
                    </td>
                  </tr>
                ) : (
                  filteredInbound.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedInbound.has(item.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-4 text-center">
                        {isAdmin && (
                          <input 
                            type="checkbox" 
                            checked={selectedInbound.has(item.id)}
                            onChange={() => toggleSelectInbound(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
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
                        {isAdmin && (
                          <button 
                            onClick={() => deleteInbound(item.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <PaginationUI />
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
