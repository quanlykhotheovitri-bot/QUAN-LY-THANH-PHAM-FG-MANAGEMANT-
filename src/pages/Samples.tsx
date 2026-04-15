import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Trash2, 
  Save,
  Settings,
  CheckCircle2,
  AlertCircle,
  Package,
  Search,
  Download,
  PackagePlus,
  PackageMinus,
  History,
  LayoutGrid,
  Edit2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { SampleTransaction } from '../types';

export default function Samples() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const [activeTab, setActiveTab] = useState<'summary' | 'history'>('summary');
  const [scanMode, setScanMode] = useState<'inbound' | 'outbound'>('inbound');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Data states
  const [transactions, setTransactions] = useState<SampleTransaction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Scan states
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [manualQR, setManualQR] = useState('');
  
  // Edit states
  const [editingTransaction, setEditingTransaction] = useState<SampleTransaction | null>(null);
  const [editForm, setEditForm] = useState({ 
    quantity: 1, 
    type: 'inbound' as 'inbound' | 'outbound',
    sso: '',
    line: ''
  });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTransactions();
  }, []);

  async function fetchTransactions() {
    try {
      const { data, error } = await supabase
        .from('sample_transactions')
        .select('*')
        .order('transaction_date', { ascending: false });
      
      if (error) throw error;
      setTransactions(data || []);
    } catch (err: any) {
      console.error('Error fetching transactions:', err);
    }
  }

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').map(l => l.trim()).filter(l => l);
    const newItems: any[] = [];
    const now = new Date().toISOString();

    lines.forEach(qr => {
      // Parse QR: SSO|Line
      const parts = qr.split('|');
      const sso = parts[0] || '';
      const line = parts[1] || '';

      // Check if already in scanned list
      if (scannedItems.some(item => item.qrcode === qr && item.type === scanMode)) return;
      
      newItems.push({
        id: crypto.randomUUID(),
        qrcode: qr,
        sso: sso,
        line: line,
        type: scanMode,
        quantity: 1,
        transaction_date: now
      });
    });

    if (newItems.length > 0) {
      setScannedItems(prev => [...newItems, ...prev]);
      setManualQR('');
      setMessage({ type: 'success', text: `Đã thêm ${newItems.length} mã vào danh sách chờ` });
    }
  };

  const handleConfirmScans = async () => {
    if (scannedItems.length === 0) return;
    setLoading(true);
    try {
      const dataToInsert = scannedItems.map(({ id, ...rest }) => rest);
      const { error } = await supabase
        .from('sample_transactions')
        .insert(dataToInsert);
      
      if (error) throw error;
      
      setMessage({ type: 'success', text: `Đã lưu ${scannedItems.length} giao dịch thành công` });
      setScannedItems([]);
      fetchTransactions();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi khi lưu: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const updateScannedItem = (id: string, field: string, value: any) => {
    setScannedItems(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const deleteTransaction = async (id: string) => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sample_transactions')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setDeleteConfirmId(null);
      fetchTransactions();
      setMessage({ type: 'success', text: 'Đã xóa giao dịch' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransaction || !isAdmin) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sample_transactions')
        .update({
          quantity: editForm.quantity,
          type: editForm.type,
          sso: editForm.sso,
          line: editForm.line
        })
        .eq('id', editingTransaction.id);

      if (error) throw error;
      setMessage({ type: 'success', text: 'Đã cập nhật giao dịch' });
      setEditingTransaction(null);
      fetchTransactions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteSelectedTransactions = async () => {
    if (selectedTransactions.size === 0 || !isAdmin) return;
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${selectedTransactions.size} giao dịch đã chọn?`)) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sample_transactions')
        .delete()
        .in('id', Array.from(selectedTransactions));
      
      if (error) throw error;
      setMessage({ type: 'success', text: `Đã xóa ${selectedTransactions.size} giao dịch` });
      setSelectedTransactions(new Set());
      fetchTransactions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteAllTransactions = async () => {
    if (!isAdmin) return;
    if (!window.confirm('Bạn có chắc chắn muốn xóa TẤT CẢ giao dịch Sample?')) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('sample_transactions')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');
      
      if (error) throw error;
      setMessage({ type: 'success', text: 'Đã xóa tất cả giao dịch' });
      fetchTransactions();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => 
      t.qrcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.sso && t.sso.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.line && t.line.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [transactions, searchTerm]);

  const toggleSelectTransaction = (id: string) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedTransactions(newSelected);
  };

  const toggleSelectAllTransactions = () => {
    if (selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(filteredTransactions.map(t => t.id)));
    }
  };

  const summaryData = useMemo(() => {
    const map = new Map<string, any>();
    transactions.forEach(t => {
      if (!map.has(t.qrcode)) {
        map.set(t.qrcode, {
          qrcode: t.qrcode,
          sso: t.sso || '',
          line: t.line || '',
          in_qty: 0,
          in_date: null as string | null,
          out_qty: 0,
          out_date: null as string | null,
          stock: 0
        });
      }
      const item = map.get(t.qrcode);
      if (t.type === 'inbound') {
        item.in_qty += t.quantity;
        if (!item.in_date || new Date(t.transaction_date) > new Date(item.in_date)) {
          item.in_date = t.transaction_date;
        }
      } else {
        item.out_qty += t.quantity;
        if (!item.out_date || new Date(t.transaction_date) > new Date(item.out_date)) {
          item.out_date = t.transaction_date;
        }
      }
      item.stock = item.in_qty - item.out_qty;
    });
    
    return Array.from(map.values()).filter(item => 
      item.qrcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sso.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.line.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [transactions, searchTerm]);

  const handleDownloadExcel = () => {
    const data = activeTab === 'summary' ? summaryData.map(item => ({
      'QRCODE': item.qrcode,
      'SSO': item.sso,
      'Line': item.line,
      'Số lượng nhập': item.in_qty,
      'Ngày nhập': item.in_date ? new Date(item.in_date).toLocaleString('vi-VN') : '',
      'Số lượng xuất': item.out_qty,
      'Ngày xuất': item.out_date ? new Date(item.out_date).toLocaleString('vi-VN') : '',
      'Tồn kho': item.stock
    })) : transactions.map(t => ({
      'Ngày': new Date(t.transaction_date).toLocaleString('vi-VN'),
      'QRCODE': t.qrcode,
      'SSO': t.sso || '',
      'Line': t.line || '',
      'Loại': t.type === 'inbound' ? 'Nhập' : 'Xuất',
      'Số lượng': t.quantity
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab === 'summary' ? 'Tổng hợp' : 'Lịch sử');
    XLSX.writeFile(wb, `Sample_Management_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('summary')}
          className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'summary' ? 'bg-purple-50 text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          TỔNG HỢP TỒN KHO
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'history' ? 'bg-purple-50 text-purple-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <History className="w-4 h-4" />
          LỊCH SỬ GIAO DỊCH
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Configuration */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border-2 border-purple-500 shadow-lg">
            <div className="flex items-center gap-2 mb-6 bg-purple-600 p-3 rounded-xl shadow-md">
              <Settings className="w-5 h-5 text-white" />
              <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình quét</h2>
            </div>
            
            <div className="space-y-6">
              {/* Scan Mode Selection */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setScanMode('inbound')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    scanMode === 'inbound' 
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-emerald-200'
                  }`}
                >
                  <PackagePlus className="w-8 h-8" />
                  <span className="text-xs font-black uppercase">Scan Nhập</span>
                </button>
                <button
                  onClick={() => setScanMode('outbound')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                    scanMode === 'outbound' 
                      ? 'border-rose-500 bg-rose-50 text-rose-700' 
                      : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-rose-200'
                  }`}
                >
                  <PackageMinus className="w-8 h-8" />
                  <span className="text-xs font-black uppercase">Scan Xuất</span>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Dán mã QR ({scanMode === 'inbound' ? 'Nhập' : 'Xuất'})
                </label>
                <textarea
                  value={manualQR}
                  onChange={(e) => setManualQR(e.target.value)}
                  rows={6}
                  className={`w-full px-4 py-3 bg-slate-50 border-2 rounded-xl text-sm font-mono focus:ring-0 transition-all resize-none ${
                    scanMode === 'inbound' ? 'focus:border-emerald-500' : 'focus:border-rose-500'
                  }`}
                  placeholder="Dán dữ liệu QR tại đây... (Mỗi dòng 1 mã)"
                />
                <button
                  onClick={handleProcessManual}
                  className={`w-full mt-2 py-3 rounded-lg text-sm font-bold transition-all ${
                    scanMode === 'inbound' 
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' 
                      : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                  }`}
                >
                  Xử lý mã
                </button>
              </div>
            </div>
          </div>

          {scannedItems.length > 0 && (
            <button
              onClick={handleConfirmScans}
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-purple-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50 uppercase tracking-widest"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Save className="w-6 h-6" />
                  XÁC NHẬN LƯU ({scannedItems.length})
                </>
              )}
            </button>
          )}

          {message && (
            <div className={`p-4 rounded-xl flex items-center gap-3 ${
              message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{message.text}</p>
            </div>
          )}
        </div>

        {/* Right Column: List */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scanned Items (Queue) */}
          {scannedItems.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-blue-500 shadow-lg overflow-hidden">
              <div className="p-4 bg-blue-600 flex items-center justify-between">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Danh sách chờ lưu ({scannedItems.length})
                </h3>
                <button 
                  onClick={() => setScannedItems([])}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-3">QRCODE</th>
                      <th className="px-6 py-3">SSO</th>
                      <th className="px-6 py-3">LINE</th>
                      <th className="px-6 py-3">LOẠI</th>
                      <th className="px-6 py-3">SỐ LƯỢNG</th>
                      <th className="px-6 py-3 text-center">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scannedItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{item.qrcode}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{item.sso}</td>
                        <td className="px-6 py-4 text-sm text-slate-600">{item.line}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                            item.type === 'inbound' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {item.type === 'inbound' ? <PackagePlus className="w-3 h-3" /> : <PackageMinus className="w-3 h-3" />}
                            {item.type === 'inbound' ? 'NHẬP' : 'XUẤT'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateScannedItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                            className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm text-center focus:border-blue-500 outline-none"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => setScannedItems(prev => prev.filter(i => i.id !== item.id))}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Main Data View */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo mã QR, SSO, Line..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-white border-2 border-slate-100 rounded-xl text-sm focus:border-purple-500 focus:ring-0 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 ml-4">
                {isAdmin && activeTab === 'history' && (
                  <>
                    <button
                      onClick={deleteAllTransactions}
                      className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-black hover:bg-rose-700 transition-all shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      XÓA TẤT CẢ
                    </button>
                    {selectedTransactions.size > 0 && (
                      <button
                        onClick={deleteSelectedTransactions}
                        className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 rounded-xl text-sm font-black hover:bg-rose-100 transition-all border-2 border-rose-200 shadow-sm"
                      >
                        <Trash2 className="w-4 h-4" />
                        XÓA ĐÃ CHỌN ({selectedTransactions.size})
                      </button>
                    )}
                  </>
                )}
                <button
                  onClick={handleDownloadExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-black hover:bg-emerald-100 transition-all border-2 border-emerald-200"
                >
                  <Download className="w-4 h-4" />
                  XUẤT EXCEL
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              {activeTab === 'summary' ? (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#002060] text-white">
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">QRCODE</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">SSO</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Line</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Số lượng nhập</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Ngày nhập</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Số lượng xuất</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Ngày xuất</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Tồn kho</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summaryData.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">Chưa có dữ liệu Sample</td>
                      </tr>
                    ) : (
                      summaryData.map((item) => (
                        <tr key={item.qrcode} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-sm font-black text-purple-600">{item.qrcode}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.sso}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{item.line}</td>
                          <td className="px-6 py-4 text-sm font-bold text-emerald-600">{item.in_qty}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {item.in_date ? new Date(item.in_date).toLocaleString('vi-VN') : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-rose-600">{item.out_qty}</td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {item.out_date ? new Date(item.out_date).toLocaleString('vi-VN') : '-'}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex px-3 py-1 rounded-full text-xs font-black ${
                              item.stock > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-400'
                            }`}>
                              {item.stock}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#002060] text-white">
                      <th className="px-4 py-4 text-center border-r border-blue-900/30">
                        {isAdmin && (
                          <input 
                            type="checkbox" 
                            checked={selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0}
                            onChange={toggleSelectAllTransactions}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Ngày</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">QRCODE</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">SSO</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Line</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Loại</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">Số lượng</th>
                      <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredTransactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-12 text-center text-slate-400 italic">Chưa có lịch sử giao dịch</td>
                      </tr>
                    ) : (
                      filteredTransactions.map((t) => (
                        <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${selectedTransactions.has(t.id) ? 'bg-blue-50' : ''}`}>
                          <td className="px-4 py-4 text-center border-r border-slate-100">
                            {isAdmin && (
                              <input 
                                type="checkbox" 
                                checked={selectedTransactions.has(t.id)}
                                onChange={() => toggleSelectTransaction(t.id)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500">
                            {new Date(t.transaction_date).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-purple-600">{t.qrcode}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{t.sso}</td>
                          <td className="px-6 py-4 text-sm text-slate-600">{t.line}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase ${
                              t.type === 'inbound' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}>
                              {t.type === 'inbound' ? <PackagePlus className="w-3 h-3" /> : <PackageMinus className="w-3 h-3" />}
                              {t.type === 'inbound' ? 'NHẬP' : 'XUẤT'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{t.quantity}</td>
                          <td className="px-6 py-4">
                            {isAdmin && (
                              <div className="flex items-center gap-2">
                                <button 
                                  onClick={() => {
                                    setEditingTransaction(t);
                                    setEditForm({ 
                                      quantity: t.quantity, 
                                      type: t.type,
                                      sso: t.sso || '',
                                      line: t.line || ''
                                    });
                                  }}
                                  className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                {deleteConfirmId === t.id ? (
                                  <div className="flex items-center gap-1">
                                    <button 
                                      onClick={() => deleteTransaction(t.id)}
                                      className="px-2 py-1 bg-rose-500 text-white rounded text-[10px] font-bold hover:bg-rose-600"
                                    >
                                      XÓA
                                    </button>
                                    <button 
                                      onClick={() => setDeleteConfirmId(null)}
                                      className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-300"
                                    >
                                      HỦY
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setDeleteConfirmId(t.id)}
                                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-purple-500">
            <div className="bg-purple-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Edit2 className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">Sửa giao dịch</h2>
              </div>
              <button onClick={() => setEditingTransaction(null)} className="p-2 hover:bg-white/20 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateTransaction} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">QR Code</label>
                  <input
                    type="text"
                    disabled
                    value={editingTransaction.qrcode}
                    className="w-full px-4 py-3 bg-slate-100 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">SSO</label>
                    <input
                      type="text"
                      value={editForm.sso}
                      onChange={(e) => setEditForm({ ...editForm, sso: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-0 transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Line</label>
                    <input
                      type="text"
                      value={editForm.line}
                      onChange={(e) => setEditForm({ ...editForm, line: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-0 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Loại giao dịch</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => setEditForm({ ...editForm, type: e.target.value as any })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-0 transition-all"
                  >
                    <option value="inbound">Nhập kho</option>
                    <option value="outbound">Xuất kho</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Số lượng</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={editForm.quantity}
                    onChange={(e) => setEditForm({ ...editForm, quantity: parseInt(e.target.value) || 1 })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-purple-500 focus:ring-0 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl shadow-purple-100 disabled:opacity-50"
              >
                CẬP NHẬT GIAO DỊCH
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
