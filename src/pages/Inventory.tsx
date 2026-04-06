import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, 
  Filter, 
  Download, 
  MapPin, 
  Package,
  ArrowUpDown,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventoryBalance } from '../types';
import { formatDate } from '../lib/utils';

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryBalance[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    setLoading(true);
    // Fetch from the optimized database view
    const { data, error } = await supabase
      .from('inventory_by_rpro')
      .select('*')
      .order('last_updated', { ascending: false });
    
    if (data) {
      setInventory(data);
    }
    setLoading(false);
  }

  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === inventory.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(inventory.map(item => `${item.so}|${item.rpro}`)));
    }
  };

  const deleteItem = async (so: string, rpro: string) => {
    let query = supabase.from('inventory_balances').delete();
    
    if (so) query = query.eq('so', so);
    else query = query.is('so', null);
    
    if (rpro) query = query.eq('rpro', rpro);
    else query = query.is('rpro', null);

    const { error } = await query;

    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `Đã xóa tồn kho cho SO: ${so}, RPRO: ${rpro}` });
      fetchInventory();
    }
  };

  const deleteSelected = async () => {
    if (selectedItems.size === 0) return;

    setLoading(true);
    try {
      const selectedIds = Array.from(selectedItems) as string[];
      for (const id of selectedIds) {
        const [so, rpro] = id.split('|');
        let query = supabase.from('inventory_balances').delete();
        
        if (so && so !== 'null') query = query.eq('so', so);
        else query = query.is('so', null);
        
        if (rpro && rpro !== 'null') query = query.eq('rpro', rpro);
        else query = query.is('rpro', null);

        await query;
      }
      setMessage({ type: 'success', text: `Đã xóa ${selectedItems.size} mục tồn kho thành công.` });
      setSelectedItems(new Set());
      fetchInventory();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter(item => 
    (item.qr_code && item.qr_code.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.rpro && item.rpro.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.so && item.so.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.kh && item.kh.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToExcel = () => {
    const data = filteredInventory.map(item => ({
      'RPRO': item.rpro,
      'SO': item.so,
      'Khách hàng': item.kh,
      'Tổng số lượng': item.total_quantity,
      'Số kiện': item.items_count,
      'Loại thùng (Mới nhất)': item.box_type,
      'Vị trí (Mới nhất)': item.location_path,
      'Cập nhật cuối': formatDate(item.last_updated)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TonKho');
    XLSX.writeFile(wb, `TonKho_ChiTiet_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý tồn kho</h1>
          <p className="text-slate-500">Chi tiết tồn kho theo từng vị trí</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selectedItems.size > 0 && (
            <button
              onClick={deleteSelected}
              className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-100 rounded-xl text-sm font-medium hover:bg-rose-100 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Xóa đã chọn ({selectedItems.size})
            </button>
          )}
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
          >
            <Download className="w-4 h-4" />
            Xuất Excel
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          <Package className="w-5 h-5" />
          <p className="text-sm font-medium">{message.text}</p>
          <button onClick={() => setMessage(null)} className="ml-auto text-xs font-bold uppercase">Đóng</button>
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Tìm kiếm theo QR, SO, RPRO, Khách hàng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4" />
            Lọc
          </button>
          <button className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl flex items-center gap-2 text-sm font-medium">
            <ArrowUpDown className="w-4 h-4" />
            Sắp xếp
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead>
              <tr className="bg-[#002060] text-white">
                <th className="px-2 py-3 border border-slate-300 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedItems.size === inventory.length && inventory.length > 0}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400">Không tìm thấy dữ liệu tồn kho</p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item: any) => {
                  const itemKey = `${item.so}|${item.rpro}`;
                  return (
                    <tr key={itemKey} className={`hover:bg-slate-50 transition-colors ${selectedItems.has(itemKey) ? 'bg-blue-50' : ''}`}>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedItems.has(itemKey)}
                          onChange={() => toggleSelectItem(itemKey)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">
                        {item.so}|{item.rpro}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold text-blue-700">{item.rpro}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.box_type}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">
                        {item.items_count} / {item.total_boxes || '?'}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                        <div className="flex items-center justify-center gap-1 text-blue-600 font-bold">
                          <MapPin className="w-3 h-3" />
                          {item.location_path}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                        {formatDate(item.last_updated)}
                      </td>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        <button 
                          onClick={() => deleteItem(item.so, item.rpro)}
                          className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
