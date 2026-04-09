import { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  Search, 
  Filter, 
  Download, 
  Upload,
  MapPin, 
  Package,
  ArrowUpDown,
  Trash2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { InventoryBalance } from '../types';
import { formatDate } from '../lib/utils';

export default function Inventory() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [inventory, setInventory] = useState<InventoryBalance[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize, setPageSize] = useState(200);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importProgress, setImportProgress] = useState<{ current: number, total: number } | null>(null);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    fetchInventory();
  }, [currentPage, searchTerm]);

  async function fetchInventory() {
    setLoading(true);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from('inventory_balances')
      .select('*', { count: 'exact' });

    if (searchTerm) {
      query = query.or(`so.ilike.%${searchTerm}%,rpro.ilike.%${searchTerm}%,kh.ilike.%${searchTerm}%`);
    }

    const { data, count, error } = await query
      .order('last_updated', { ascending: false })
      .range(from, to);
    
    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi tải tồn kho: ' + errorMsg });
    } else if (data) {
      setInventory(data);
      if (count !== null) setTotalCount(count);
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
    if (selectedItems.size === filteredInventory.length && filteredInventory.length > 0) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredInventory.map(item => item.so + '|' + item.rpro)));
    }
  };

  const deleteGroup = async (ids: string[]) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa nhóm này (${ids.length} mục)?`)) return;
    
    const { error } = await supabase
      .from('inventory_balances')
      .delete()
      .in('id', ids);

    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + errorMsg });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa nhóm tồn kho thành công' });
      fetchInventory();
    }
  };

  const deleteSelected = async () => {
    if (selectedItems.size === 0) return;

    setLoading(true);
    try {
      const selectedGroupKeys = Array.from(selectedItems);
      const idsToDelete: string[] = [];
      
      selectedGroupKeys.forEach(groupKey => {
        const group = filteredInventory.find(g => (g.so + '|' + g.rpro) === groupKey);
        if (group) {
          idsToDelete.push(...group.ids);
        }
      });

      const { error } = await supabase
        .from('inventory_balances')
        .delete()
        .in('id', idsToDelete);
        
      if (error) {
        const errorMsg = error.message.includes('Failed to fetch')
          ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
          : error.message;
        throw new Error(errorMsg);
      }

      setMessage({ type: 'success', text: `Đã xóa ${selectedItems.size} nhóm tồn kho thành công.` });
      setSelectedItems(new Set());
      fetchInventory();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteAllInventory = async () => {
    if (!window.confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA TOÀN BỘ TỒN KHO? Hành động này không thể hoàn tác.')) return;

    setLoading(true);
    setMessage({ type: 'success', text: 'Đang bắt đầu quá trình xóa toàn bộ dữ liệu...' });
    
    try {
      // Method 1: Try bulk delete first (fastest)
      // Some Supabase projects allow this if RLS is configured to allow unbounded deletes
      const { error: bulkError } = await supabase
        .from('inventory_balances')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (!bulkError) {
        setMessage({ type: 'success', text: 'Đã xóa toàn bộ tồn kho thành công.' });
        setInventory([]);
        setTotalCount(0);
        setSelectedItems(new Set());
        return;
      }

      // Method 2: Fallback to batch deletion if bulk delete is restricted or times out
      console.warn('Bulk delete failed or restricted, falling back to batch deletion...', bulkError);
      
      let totalDeleted = 0;
      let hasMore = true;
      let batchCount = 0;

      while (hasMore) {
        // Fetch a batch of IDs to delete
        const { data, error: fetchError } = await supabase
          .from('inventory_balances')
          .select('id')
          .limit(2000); // Increased batch size for speed

        if (fetchError) throw fetchError;
        
        if (!data || data.length === 0) {
          hasMore = false;
          break;
        }

        const ids = data.map(item => item.id);
        const { error: deleteError } = await supabase
          .from('inventory_balances')
          .delete()
          .in('id', ids);

        if (deleteError) throw deleteError;
        
        totalDeleted += ids.length;
        batchCount++;
        
        // Update progress message
        setMessage({ type: 'success', text: `Đang xóa dữ liệu... Đã xóa ${totalDeleted.toLocaleString()} mục.` });
        
        // Safety break to prevent infinite loop
        if (batchCount > 200) { // Max 400,000 items
          break;
        }
      }

      setMessage({ 
        type: 'success', 
        text: totalDeleted > 0 
          ? `Đã xóa toàn bộ tồn kho thành công (${totalDeleted.toLocaleString()} mục).` 
          : 'Kho đã trống, không có gì để xóa.' 
      });
      setInventory([]);
      setTotalCount(0);
      setSelectedItems(new Set());
      fetchInventory();
    } catch (error: any) {
      console.error('Delete all error:', error);
      setMessage({ type: 'error', text: 'Lỗi khi xóa toàn bộ: ' + error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setImportProgress(null);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          const data = XLSX.utils.sheet_to_json(ws) as any[];

          const totalItems = data.length;
          if (totalItems === 0) {
            setMessage({ type: 'error', text: 'File Excel không có dữ liệu.' });
            setLoading(false);
            return;
          }

          setImportProgress({ current: 0, total: totalItems });

          const itemsToInsert = data.map(row => {
            const so = row['SO'] || row['so'] || '';
            const rpro = row['RPRO'] || row['rpro'] || '';
            const boxType = row['LOẠI THÙNG'] || row['loại thùng'] || row['box_type'] || '';
            const location = row['VỊ TRÍ'] || row['vị trí'] || row['location_path'] || '';
            const kh = row['KHÁCH HÀNG'] || row['khách hàng'] || row['kh'] || '';
            const qrCodeFromExcel = row['QRCODE'] || row['qrcode'] || row['qr_code'];
            
            let quantity = 0;
            let totalBoxes = 0;
            const qtyStr = String(row['SỐ THÙNG ĐƠN HÀNG'] || row['số thùng đơn hàng'] || row['items_count'] || '0');
            if (qtyStr.includes('/')) {
              const parts = qtyStr.split('/');
              quantity = parseInt(parts[0].trim()) || 0;
              totalBoxes = parseInt(parts[1].trim()) || 0;
            } else {
              quantity = parseInt(qtyStr) || 0;
              totalBoxes = parseInt(String(row['total_boxes'] || '0')) || 0;
            }

            return {
              so,
              rpro,
              kh,
              box_type: boxType,
              location_path: location,
              quantity,
              total_boxes: totalBoxes,
              qr_code: qrCodeFromExcel || `${so}|${rpro}|${Math.random().toString(36).substring(2, 7)}`,
              last_updated: new Date().toISOString()
            };
          });

          // Deduplicate by qr_code to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time"
          const uniqueItemsMap = new Map();
          itemsToInsert.forEach(item => {
            uniqueItemsMap.set(item.qr_code, item);
          });
          const uniqueItemsToInsert = Array.from(uniqueItemsMap.values());
          const totalUnique = uniqueItemsToInsert.length;

          setImportProgress({ current: 0, total: totalUnique });

          // Chunking inserts
          const chunkSize = 1000;
          let successCount = 0;

          for (let i = 0; i < uniqueItemsToInsert.length; i += chunkSize) {
            const chunk = uniqueItemsToInsert.slice(i, i + chunkSize);
            const { error } = await supabase
              .from('inventory_balances')
              .upsert(chunk, { onConflict: 'qr_code' });
            
            if (error) {
              console.error('Error inserting chunk:', error);
              throw new Error(`Lỗi tại dòng ${i + 1}: ${error.message}`);
            }
            
            successCount += chunk.length;
            setImportProgress({ current: successCount, total: totalUnique });
          }

          setMessage({ type: 'success', text: `Đã nhập thành công ${successCount} / ${totalUnique} mục tồn kho (đã lọc trùng).` });
          fetchInventory();
        } catch (error: any) {
          console.error('Import error:', error);
          setMessage({ type: 'error', text: 'Lỗi khi nhập: ' + error.message });
        } finally {
          setLoading(false);
          setImportProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi đọc file: ' + error.message });
      setLoading(false);
    }
  };

  const groupedInventory = useMemo(() => {
    const groups: { [key: string]: any } = {};
    
    inventory.forEach(item => {
      // Group by combination of SO and RPRO
      const key = `${item.so || ''}|${item.rpro || ''}`;
      if (!groups[key]) {
        groups[key] = {
          ...item,
          ids: [item.id],
          quantity: item.quantity || 0,
          // For total_boxes, we take the value from the first item in the group
          // since total_boxes represents the total for the entire SO/RPRO order
          total_boxes: item.total_boxes || 0,
          locations: new Set([item.location_path]),
          last_updated: item.last_updated
        };
      } else {
        groups[key].ids.push(item.id);
        groups[key].quantity += (item.quantity || 0);
        // Do NOT sum total_boxes, as it's the same for all items in this SO/RPRO group
        if (!groups[key].total_boxes && item.total_boxes) {
          groups[key].total_boxes = item.total_boxes;
        }
        if (item.location_path) groups[key].locations.add(item.location_path);
        if (new Date(item.last_updated) > new Date(groups[key].last_updated)) {
          groups[key].last_updated = item.last_updated;
        }
      }
    });

    return Object.values(groups).map(group => ({
      ...group,
      location_path: Array.from(group.locations).filter(Boolean).sort().join(', ')
    }));
  }, [inventory]);

  const filteredInventory = groupedInventory;

  const totalPages = Math.ceil(totalCount / pageSize);

  const PaginationUI = () => (
    <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 bg-slate-50 border-t-2 border-slate-200 gap-4">
      <div className="flex items-center gap-4">
        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Hiển thị {Math.min(totalCount, (currentPage - 1) * pageSize + 1)}-{Math.min(totalCount, currentPage * pageSize)} trong {totalCount}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase">Số dòng:</span>
          <select 
            value={pageSize} 
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="text-xs font-bold bg-white border border-slate-200 rounded px-2 py-1 outline-none focus:border-blue-400"
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
            <option value={5000}>5000 (Chậm)</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
          disabled={currentPage === 1}
          className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
        >
          TRƯỚC
        </button>
        <div className="flex items-center px-4 bg-white border-2 border-slate-200 rounded-xl text-xs font-black">
          TRANG {currentPage} / {totalPages || 1}
        </div>
        <button
          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
          disabled={currentPage === totalPages || totalPages === 0}
          className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
        >
          SAU
        </button>
      </div>
    </div>
  );

  const exportData = (format: 'xlsx' | 'csv') => {
    const data = filteredInventory.map(item => ({
      'SO': item.so,
      'RPRO': item.rpro,
      'KHÁCH HÀNG': item.kh,
      'LOẠI THÙNG': item.box_type,
      'SỐ THÙNG ĐƠN HÀNG': item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity,
      'VỊ TRÍ': item.location_path,
      'NGÀY NHẬP': formatDate(item.last_updated)
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TonKho');
    XLSX.writeFile(wb, `TonKho_Export_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 bg-blue-600 p-3 rounded-xl shadow-md">
          <Package className="w-6 h-6 text-white" />
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight leading-none">Quản lý tồn kho</h1>
            <p className="text-blue-100 text-[10px] uppercase font-bold tracking-widest mt-1">Chi tiết tồn kho theo từng vị trí</p>
          </div>
        </div>
          <div className="flex flex-wrap gap-3">
            {isAdmin && selectedItems.size > 0 && (
              <button
                onClick={deleteSelected}
                className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border-2 border-rose-200 rounded-xl text-sm font-black hover:bg-rose-100 transition-all shadow-md"
              >
                <Trash2 className="w-4 h-4" />
                XÓA ĐÃ CHỌN ({selectedItems.size})
              </button>
            )}
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImportExcel} 
            className="hidden" 
            accept=".xlsx, .xls"
          />
          {isAdmin && (
            <button
              onClick={deleteAllInventory}
              className="flex items-center gap-2 px-6 py-3 bg-rose-600 text-white rounded-xl font-black hover:bg-rose-700 transition-all shadow-lg active:scale-95"
            >
              <Trash2 className="w-5 h-5" />
              XÓA TẤT CẢ
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-all shadow-lg active:scale-95"
          >
            <Upload className="w-5 h-5" />
            NHẬP EXCEL
          </button>
          <button
            onClick={() => exportData('xlsx')}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black hover:bg-emerald-700 transition-all shadow-lg active:scale-95"
          >
            <Download className="w-5 h-5" />
            XUẤT EXCEL
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
        {importProgress && (
          <div className="bg-blue-50 p-4 border-b border-blue-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-blue-700 uppercase tracking-wider">Đang nhập dữ liệu...</span>
              <span className="text-sm font-bold text-blue-700">{Math.round((importProgress.current / importProgress.total) * 100)}%</span>
            </div>
            <div className="w-full bg-blue-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-[10px] text-blue-500 mt-1 font-bold">Đã xử lý: {importProgress.current.toLocaleString()} / {importProgress.total.toLocaleString()} dòng</p>
          </div>
        )}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-white border-2 border-slate-200 rounded-xl font-black focus:border-blue-400 focus:ring-4 focus:ring-blue-100 outline-none transition-all"
              />
            </div>
          </div>
          <div className="text-sm font-black text-slate-500 uppercase tracking-widest">
            Tổng cộng: <span className="text-blue-600">{filteredInventory.length}</span> nhóm hàng
          </div>
        </div>

        <div className="overflow-x-auto max-h-[calc(100vh-320px)] overflow-y-auto">
          <table className="w-full text-left border-collapse border border-slate-200">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[#002060] text-white">
                <th className="px-2 py-3 border border-slate-300 text-center bg-[#002060]">
                  {isAdmin && (
                    <input 
                      type="checkbox" 
                      checked={selectedItems.size === filteredInventory.length && filteredInventory.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  )}
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">SO</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">RPRO</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">KHÁCH HÀNG</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">LOẠI THÙNG</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">SỐ THÙNG ĐƠN HÀNG</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">VỊ TRÍ</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">NGÀY NHẬP</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap bg-[#002060]">THAO TÁC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center">
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
                        {isAdmin && (
                          <input 
                            type="checkbox" 
                            checked={selectedItems.has(itemKey)}
                            onChange={() => toggleSelectItem(itemKey)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold text-blue-700">{item.rpro}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.kh}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.box_type}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">
                        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
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
                        {isAdmin && (
                          <button 
                            onClick={() => deleteGroup(item.ids)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && filteredInventory.length > 0 && (
              <tfoot className="bg-slate-50 font-bold sticky bottom-0 z-10 border-t-2 border-slate-300">
                <tr>
                  <td className="px-2 py-3 border border-slate-300 text-center"></td>
                  <td colSpan={4} className="px-4 py-3 text-right text-[11px] border border-slate-300 uppercase tracking-wider">Tổng cộng:</td>
                  <td className="px-4 py-3 text-[11px] border border-slate-300 text-center text-blue-700">
                    {filteredInventory.reduce((sum, item) => sum + (item.quantity || 0), 0)}
                  </td>
                  <td colSpan={3} className="px-4 py-3 border border-slate-300"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <PaginationUI />
      </div>
    </div>
  );
}
