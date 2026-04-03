import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Search, 
  Filter, 
  Download, 
  MapPin, 
  Package,
  ArrowUpDown
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventoryBalance } from '../types';
import { formatDate } from '../lib/utils';

export default function Inventory() {
  const [inventory, setInventory] = useState<InventoryBalance[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInventory();
  }, []);

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase
      .from('inventory_balances')
      .select('*, warehouse_locations(*)');
    
    if (data) setInventory(data);
    setLoading(false);
  }

  const filteredInventory = inventory.filter(item => 
    item.qr_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.rpro && item.rpro.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.so && item.so.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (item.kh && item.kh.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const exportToExcel = () => {
    const data = filteredInventory.map(item => ({
      'Mã QR': item.qr_code,
      'SO': item.so,
      'RPRO': item.rpro,
      'Khách hàng': item.kh,
      'Số lượng': item.quantity,
      'Loại thùng': item.box_type,
      'Vị trí': item.warehouse_locations?.full_path,
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
        <button
          onClick={exportToExcel}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium hover:bg-slate-50 transition-all"
        >
          <Download className="w-4 h-4" />
          Xuất Excel
        </button>
      </div>

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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hàng hóa</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Khách hàng</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Số lượng</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vị trí</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cập nhật cuối</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400">Không tìm thấy dữ liệu tồn kho</p>
                  </td>
                </tr>
              ) : (
                filteredInventory.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{item.rpro || item.so}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.qr_code}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{item.kh}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-slate-900">{item.quantity}</span>
                      <div className="text-[10px] text-slate-400">{item.box_type}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1 text-sm font-bold text-blue-600">
                        <MapPin className="w-3 h-3" />
                        {item.warehouse_locations?.full_path}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500">
                      {formatDate(item.last_updated)}
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
