import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Trash2, 
  Save,
  Settings,
  CheckCircle2,
  AlertCircle,
  Package,
  Users,
  Search,
  Plus,
  Upload,
  Edit2,
  X,
  Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PlasticBinCustomer } from '../types';

export default function PlasticBins() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isViewer = user?.role === 'viewer';
  const [activeTab, setActiveTab] = useState<'process' | 'customers'>('process');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  // Data states
  const [customers, setCustomers] = useState<PlasticBinCustomer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Scan/Process states
  const [scannedReturns, setScannedReturns] = useState<any[]>([]);
  const [recentReturns, setRecentReturns] = useState<any[]>([]);
  const [manualQR, setManualQR] = useState('');

  // Customer Form states
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<PlasticBinCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState({ code: '', name: '' });
  const [customerDeleteConfirmId, setCustomerDeleteConfirmId] = useState<string | null>(null);

  // Return Edit states
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [editingReturn, setEditingReturn] = useState<any | null>(null);
  const [returnForm, setReturnForm] = useState({ qrcode: '', customer_name: '', quantity_large: 1, quantity_small: 0 });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchCustomers();
    fetchRecentReturns();
  }, []);

  async function fetchRecentReturns() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('plastic_bin_returns')
        .select('*')
        .gte('return_date', today.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setRecentReturns(data || []);
    } catch (err: any) {
      console.error('Error fetching recent returns:', err);
    }
  }

  async function fetchCustomers() {
    try {
      const { data, error } = await supabase
        .from('plastic_bin_customers')
        .select('*')
        .order('code', { ascending: true });
      if (error) throw error;
      const customerList = data || [];
      setCustomers(customerList);

      // Tự động cập nhật tên khách hàng trong danh sách chờ nếu trước đó chưa xác định
      setScannedReturns(prev => prev.map(item => {
        if (item.customer_name === 'Chưa xác định') {
          const found = customerList.find(c => item.qrcode.startsWith(c.code));
          if (found) {
            return { ...item, customer_name: found.name };
          }
        }
        return item;
      }));
    } catch (err: any) {
      console.error('Error fetching customers:', err);
      setMessage({ type: 'error', text: 'Không thể tải danh sách khách hàng. Vui lòng kiểm tra kết nối.' });
    }
  }

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').map(l => l.trim()).filter(l => l);
    const newItems: any[] = [];
    const now = new Date().toISOString();

    lines.forEach(qr => {
      if (scannedReturns.some(item => item.qrcode === qr)) return;

      // Auto-lookup customer
      const found = customers.find(c => qr.startsWith(c.code));
      
      newItems.push({
        id: crypto.randomUUID(),
        return_date: now,
        qrcode: qr,
        customer_name: found ? found.name : 'Chưa xác định',
        quantity_large: 1,
        quantity_small: 0
      });
    });

    if (newItems.length > 0) {
      setScannedReturns(prev => [...newItems, ...prev]);
      setManualQR('');
      setMessage({ type: 'success', text: `Đã xử lý ${newItems.length} mã` });
    }
  };

  const handleConfirmReturns = async () => {
    if (scannedReturns.length === 0) return;
    setLoading(true);
    try {
      const dataToInsert = scannedReturns.map(({ id, ...rest }) => rest);
      const { error } = await supabase
        .from('plastic_bin_returns')
        .insert(dataToInsert);
      
      if (error) throw error;
      
      setMessage({ type: 'success', text: `Đã lưu ${scannedReturns.length} thông tin trả thùng` });
      setScannedReturns([]);
      fetchRecentReturns();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi khi lưu: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const updateScannedItem = (id: string, field: string, value: any) => {
    setScannedReturns(prev => prev.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingCustomer) {
        const { error } = await supabase
          .from('plastic_bin_customers')
          .update(newCustomer)
          .eq('id', editingCustomer.id);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Đã cập nhật khách hàng' });
      } else {
        const { error } = await supabase
          .from('plastic_bin_customers')
          .insert([newCustomer]);
        if (error) throw error;
        setMessage({ type: 'success', text: 'Đã thêm khách hàng mới' });
      }
      setShowCustomerForm(false);
      setEditingCustomer(null);
      setNewCustomer({ code: '', name: '' });
      fetchCustomers();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteCustomer = async (id: string) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Bạn không có quyền thực hiện thao tác này' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('plastic_bin_customers')
        .delete()
        .eq('id', id);
      if (error) throw error;
      setCustomerDeleteConfirmId(null);
      fetchCustomers();
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteSavedReturn = async (id: string) => {
    if (!isAdmin) {
      setMessage({ type: 'error', text: 'Bạn không có quyền thực hiện thao tác này' });
      return;
    }
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('plastic_bin_returns')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      
      setMessage({ type: 'success', text: 'Đã xóa bản ghi thành công' });
      setDeleteConfirmId(null);
      await fetchRecentReturns();
    } catch (err: any) {
      console.error('Error deleting return:', err);
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + (err.message || 'Lỗi không xác định') });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSavedReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin || !editingReturn) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('plastic_bin_returns')
        .update({
          quantity_large: returnForm.quantity_large,
          quantity_small: returnForm.quantity_small,
          customer_name: returnForm.customer_name
        })
        .eq('id', editingReturn.id);

      if (error) throw error;
      setMessage({ type: 'success', text: 'Đã cập nhật bản ghi' });
      setShowReturnForm(false);
      setEditingReturn(null);
      fetchRecentReturns();
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReturns = () => {
    if (recentReturns.length === 0) {
      setMessage({ type: 'error', text: 'Không có dữ liệu để tải xuống' });
      return;
    }

    const data = recentReturns.map(item => ({
      'Ngày': new Date(item.return_date).toLocaleDateString('vi-VN'),
      'QR Code': item.qrcode,
      'Khách hàng': item.customer_name,
      'Thùng Lớn': item.quantity_large,
      'Thùng Nhỏ': item.quantity_small
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Returns');
    XLSX.writeFile(wb, `Tra_Thung_Nhua_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

        // Skip header row (index 0) and map data
        // Column A is index 0 (CODE), Column B is index 1 (KHÁCH HÀNG)
        const customersToInsert = data.slice(1).map((row: any[]) => ({
          code: String(row[0] || '').trim(),
          name: String(row[1] || '').trim()
        })).filter(c => c.code && c.name);

        if (customersToInsert.length === 0) {
          throw new Error('Không tìm thấy dữ liệu hợp lệ trong file');
        }

        const { error } = await supabase
          .from('plastic_bin_customers')
          .upsert(customersToInsert, { onConflict: 'code' });

        if (error) throw error;
        setMessage({ type: 'success', text: `Đã tải lên và lưu ${customersToInsert.length} khách hàng thành công` });
        await fetchCustomers();
      } catch (err: any) {
        setMessage({ type: 'error', text: 'Lỗi file hoặc lưu dữ liệu: ' + err.message });
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const filteredCustomers = customers.filter(c => 
    c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab('process')}
          className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'process' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Settings className="w-4 h-4" />
          XỬ LÝ TRẢ THÙNG
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
            activeTab === 'customers' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          DANH SÁCH KHÁCH HÀNG
        </button>
      </div>

      {activeTab === 'process' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Configuration */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
              <div className="flex items-center gap-2 mb-6 bg-blue-600 p-3 rounded-xl shadow-md">
                <Settings className="w-5 h-5 text-white" />
                <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình quét</h2>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Dán mã QR (Thủ công)</label>
                  <textarea
                    value={manualQR}
                    onChange={(e) => setManualQR(e.target.value)}
                    rows={6}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-mono focus:border-blue-500 focus:ring-0 transition-all resize-none"
                    placeholder="Dán dữ liệu QR tại đây... (Mỗi dòng 1 mã)"
                  />
                  <button
                    onClick={handleProcessManual}
                    className="w-full mt-2 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-all"
                  >
                    Xử lý mã
                  </button>
                </div>
              </div>
            </div>

            {scannedReturns.length > 0 && (
              <button
                onClick={handleConfirmReturns}
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50 uppercase tracking-widest"
              >
                {loading ? (
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Save className="w-6 h-6" />
                    XÁC NHẬN TRẢ THÙNG ({scannedReturns.length})
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

          {/* Right Column: Scanned List */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-lg overflow-hidden">
              <div className="p-6 border-b border-emerald-100 flex items-center justify-between bg-emerald-600 shadow-md">
                <h2 className="text-lg font-bold text-white">
                  Danh sách trả thùng ({scannedReturns.length + recentReturns.length})
                </h2>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-xs font-bold text-white/90">
                    <div className="w-3 h-3 rounded-full bg-blue-400 border border-white/20"></div>
                    <span>Chờ nhập: {scannedReturns.length}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-white/90">
                    <div className="w-3 h-3 rounded-full bg-emerald-400 border border-white/20"></div>
                    <span>Đã lưu: {recentReturns.length}</span>
                  </div>
                  <button 
                    onClick={handleDownloadReturns}
                    className="p-2 text-white/70 hover:text-white transition-colors ml-2"
                    title="Tải xuống dữ liệu đã lưu"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                  {!isViewer && scannedReturns.length > 0 && (
                    <button 
                      onClick={() => setScannedReturns([])}
                      className="p-2 text-white/70 hover:text-white transition-colors ml-2"
                      title="Xóa danh sách chờ"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
              
              <div className="overflow-x-auto">
                {scannedReturns.length === 0 && recentReturns.length === 0 ? (
                  <div className="p-12 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400">Chưa có kiện hàng nào được dán hoặc đã lưu trong hôm nay</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-[#002060] text-white">
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">NGÀY</th>
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">QRCODE</th>
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">KHÁCH HÀNG</th>
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">THÙNG LỚN</th>
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">THÙNG NHỎ</th>
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest w-24 text-center">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {/* Hiển thị danh sách chờ nhập trước */}
                      {scannedReturns.map((item) => (
                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors bg-blue-50/10">
                          <td className="px-6 py-4 text-sm font-bold text-slate-500">
                            {new Date(item.return_date).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-blue-600">{item.qrcode}</td>
                          <td className="px-6 py-4 text-sm font-bold text-slate-900">{item.customer_name}</td>
                          <td className="px-6 py-4 text-sm font-black text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400">x</span>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity_large}
                                disabled={isViewer}
                                onChange={(e) => updateScannedItem(item.id, 'quantity_large', parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-sm text-center focus:border-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm font-black text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span className="text-slate-400">x</span>
                              <input
                                type="number"
                                min="0"
                                value={item.quantity_small}
                                disabled={isViewer}
                                onChange={(e) => updateScannedItem(item.id, 'quantity_small', parseInt(e.target.value) || 0)}
                                className="w-16 px-2 py-1 bg-white border border-slate-200 rounded text-sm text-center focus:border-blue-500 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {!isViewer && (
                              <button 
                                onClick={() => setScannedReturns(prev => prev.filter(i => i.id !== item.id))}
                                className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                title="Xóa khỏi danh sách chờ"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      
                      {/* Hiển thị danh sách đã lưu */}
                      {recentReturns.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50 transition-colors opacity-80">
                          <td className="px-6 py-4 text-sm text-slate-400">
                            {new Date(item.return_date).toLocaleDateString('vi-VN')}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-500">{item.qrcode}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-600">{item.customer_name}</td>
                          <td className="px-6 py-4 text-sm font-bold text-center text-slate-500">
                            x {item.quantity_large ?? item.quantity ?? 0}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-center text-slate-500">
                            x {item.quantity_small ?? 0}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px] font-black uppercase tracking-tighter border border-emerald-100">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                ĐÃ LƯU
                              </span>
                              {isAdmin && (
                                <div className="flex items-center gap-2">
                                  <button 
                                    onClick={() => {
                                      setEditingReturn(item);
                                      setReturnForm({
                                        qrcode: item.qrcode,
                                        customer_name: item.customer_name,
                                        quantity_large: item.quantity_large,
                                        quantity_small: item.quantity_small
                                      });
                                      setShowReturnForm(true);
                                    }}
                                    className="p-1 text-slate-300 hover:text-blue-500 transition-colors"
                                    title="Sửa bản ghi"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  {deleteConfirmId === item.id ? (
                                    <div className="flex items-center gap-1">
                                      <button 
                                        onClick={() => deleteSavedReturn(item.id)}
                                        className="px-2 py-0.5 bg-rose-500 text-white rounded text-[10px] font-bold hover:bg-rose-600 transition-all"
                                      >
                                        XÓA
                                      </button>
                                      <button 
                                        onClick={() => setDeleteConfirmId(null)}
                                        className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-300 transition-all"
                                      >
                                        HỦY
                                      </button>
                                    </div>
                                  ) : (
                                    <button 
                                      onClick={() => setDeleteConfirmId(item.id)}
                                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                      title="Xóa bản ghi đã lưu"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-white p-4 rounded-2xl border-2 border-slate-200 shadow-md flex flex-wrap gap-3 items-center justify-between">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm theo mã hoặc tên khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm focus:border-blue-500 focus:ring-0 transition-all"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
                accept=".xlsx, .xls"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-black hover:bg-emerald-100 transition-all border-2 border-emerald-200"
              >
                <Upload className="w-4 h-4" />
                TẢI LÊN FILE
              </button>
              <button
                onClick={() => {
                  setEditingCustomer(null);
                  setNewCustomer({ code: '', name: '' });
                  setShowCustomerForm(true);
                }}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                <Plus className="w-4 h-4" />
                THÊM KHÁCH HÀNG
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#002060] text-white">
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">CODE</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest border-r border-blue-900/30">KHÁCH HÀNG</th>
                    <th className="px-6 py-4 text-xs font-black uppercase tracking-widest w-32">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-center text-slate-400 italic">Chưa có danh sách khách hàng</td>
                    </tr>
                  ) : (
                    filteredCustomers.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 text-sm font-black text-blue-600">{item.code}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">{item.name}</td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button 
                              onClick={() => {
                                setEditingCustomer(item);
                                setNewCustomer({ code: item.code, name: item.name });
                                setShowCustomerForm(true);
                              }}
                              className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <div className="flex items-center gap-2">
                                {customerDeleteConfirmId === item.id ? (
                                  <div className="flex items-center gap-1">
                                    <button 
                                      onClick={() => deleteCustomer(item.id)}
                                      className="px-2 py-1 bg-rose-500 text-white rounded text-[10px] font-bold hover:bg-rose-600 transition-all"
                                    >
                                      XÓA
                                    </button>
                                    <button 
                                      onClick={() => setCustomerDeleteConfirmId(null)}
                                      className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold hover:bg-slate-300 transition-all"
                                    >
                                      HỦY
                                    </button>
                                  </div>
                                ) : (
                                  <button 
                                    onClick={() => setCustomerDeleteConfirmId(item.id)} 
                                    className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                                    title="Xóa khách hàng"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Customer Form Modal */}
      {showCustomerForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-blue-500">
            <div className="bg-blue-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">
                  {editingCustomer ? 'Sửa khách hàng' : 'Thêm khách hàng'}
                </h2>
              </div>
              <button onClick={() => setShowCustomerForm(false)} className="p-2 hover:bg-white/20 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleAddCustomer} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Mã khách hàng (CODE)</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập mã..."
                    value={newCustomer.code}
                    onChange={(e) => setNewCustomer({ ...newCustomer, code: e.target.value.toUpperCase() })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-0 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Tên khách hàng</label>
                  <input
                    type="text"
                    required
                    placeholder="Nhập tên..."
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-0 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
              >
                {editingCustomer ? 'CẬP NHẬT' : 'THÊM MỚI'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Return Edit Modal */}
      {showReturnForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border-2 border-blue-500">
            <div className="bg-blue-600 p-6 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Edit2 className="w-6 h-6" />
                <h2 className="text-xl font-black uppercase tracking-tight">Sửa bản ghi đã lưu</h2>
              </div>
              <button onClick={() => setShowReturnForm(false)} className="p-2 hover:bg-white/20 rounded-xl transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <form onSubmit={handleUpdateSavedReturn} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">QR Code (Không thể sửa)</label>
                  <input
                    type="text"
                    disabled
                    value={returnForm.qrcode}
                    className="w-full px-4 py-3 bg-slate-100 border-2 border-slate-200 rounded-xl text-sm font-bold text-slate-500 cursor-not-allowed"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Khách hàng</label>
                  <input
                    type="text"
                    required
                    value={returnForm.customer_name}
                    onChange={(e) => setReturnForm({ ...returnForm, customer_name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-0 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Thùng Lớn</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={returnForm.quantity_large}
                    onChange={(e) => setReturnForm({ ...returnForm, quantity_large: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-0 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Thùng Nhỏ</label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={returnForm.quantity_small}
                    onChange={(e) => setReturnForm({ ...returnForm, quantity_small: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-blue-500 focus:ring-0 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-xl shadow-blue-100 disabled:opacity-50"
              >
                CẬP NHẬT BẢN GHI
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
