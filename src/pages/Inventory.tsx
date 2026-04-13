import { useState, useEffect, useRef, ChangeEvent, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLoading } from '../contexts/LoadingContext';
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
import { formatDate, parseQRCode } from '../lib/utils';

export default function Inventory() {
  const { user } = useAuth();
  const { setIsLoading } = useLoading();
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
    setIsLoading(true);
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
    setIsLoading(false);
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
    setIsLoading(true);
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
      setIsLoading(false);
    }
  };

  const deleteAllInventory = async () => {
    if (!window.confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA TOÀN BỘ TỒN KHO? Hành động này không thể hoàn tác.')) return;

    setLoading(true);
    setIsLoading(true);
    setMessage({ type: 'success', text: 'Đang chuẩn bị xóa dữ liệu...' });
    
    try {
      let totalDeleted = 0;
      let hasMore = true;
      let consecutiveEmptyBatches = 0;

      // We use a loop to delete in small batches. 
      // This is the most reliable way to delete large amounts of data in Supabase
      // without hitting statement timeouts or RLS bulk-delete restrictions.
      while (hasMore) {
        // 1. Fetch a batch of IDs
        const { data, error: fetchError } = await supabase
          .from('inventory_balances')
          .select('id')
          .limit(500); // Smaller batch size for better reliability

        if (fetchError) {
          throw new Error(`Lỗi truy vấn: ${fetchError.message}`);
        }
        
        if (!data || data.length === 0) {
          // Double check to ensure we didn't just hit a temporary empty result
          consecutiveEmptyBatches++;
          if (consecutiveEmptyBatches >= 2) {
            hasMore = false;
            break;
          }
          continue;
        }

        consecutiveEmptyBatches = 0;
        const ids = data.map(item => item.id);

        // 2. Delete this specific batch of IDs
        const { error: deleteError } = await supabase
          .from('inventory_balances')
          .delete()
          .in('id', ids);

        if (deleteError) {
          // If a specific batch fails, it's likely a database constraint or permission issue
          throw new Error(`Lỗi SQL khi xóa: ${deleteError.message}`);
        }
        
        totalDeleted += ids.length;
        
        // 3. Update UI progress
        setMessage({ 
          type: 'success', 
          text: `Đang thực hiện xóa... Đã xóa ${totalDeleted.toLocaleString()} mục.` 
        });

        // 4. Small delay to prevent overwhelming the database connection
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Safety limit to prevent infinite loops (max 100k items)
        if (totalDeleted > 100000) {
          break;
        }
      }

      if (totalDeleted > 0) {
        setMessage({ 
          type: 'success', 
          text: `THÀNH CÔNG: Đã xóa sạch toàn bộ ${totalDeleted.toLocaleString()} mục tồn kho.` 
        });
      } else {
        setMessage({ type: 'success', text: 'Kho đã trống, không có dữ liệu để xóa.' });
      }
      
      // Reset local state
      setInventory([]);
      setTotalCount(0);
      setSelectedItems(new Set());
      setCurrentPage(1);
      
    } catch (error: any) {
      console.error('Delete all error:', error);
      setMessage({ 
        type: 'error', 
        text: 'LỖI HỆ THỐNG: ' + (error.message || 'Không thể hoàn thành việc xóa.') 
      });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleImportExcel = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setIsLoading(true);
    setImportProgress(null);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const ws = wb.Sheets[wsname];
          
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          if (rawRows.length === 0) {
            setMessage({ type: 'error', text: 'File Excel không có dữ liệu.' });
            setLoading(false);
            setIsLoading(false);
            return;
          }

          // Check if it's structured or single column
          let isStructured = false;
          const firstFewRows = rawRows.slice(0, 5);
          for (const row of firstFewRows) {
            const rowStr = row.map(c => String(c || '').toUpperCase());
            if (rowStr.includes('SO') || rowStr.includes('RPRO') || rowStr.includes('QRCODE')) {
              isStructured = true;
              break;
            }
          }

          let data: any[] = [];
          if (isStructured) {
            data = XLSX.utils.sheet_to_json(ws);
          } else {
            let currentLocation = '';
            rawRows.forEach(row => {
              const rowValues = row.map(v => String(v || '').trim()).filter(Boolean);
              if (rowValues.length === 0) return;
              
              const qrValue = rowValues.find(v => v.includes('|'));
              if (qrValue) {
                const parsed = parseQRCode(qrValue);
                data.push({
                  'SO': parsed.so,
                  'RPRO': parsed.rpro,
                  'QRCODE': parsed.qrCode,
                  'VỊ TRÍ': currentLocation,
                  'SỐ THÙNG ĐƠN HÀNG': `${parsed.quantity}/${parsed.totalBoxes}`
                });
              } else {
                // If no pipe, the first value is the location
                currentLocation = rowValues[0];
              }
            });
          }

          const totalItems = data.length;
          if (totalItems === 0) {
            setMessage({ type: 'error', text: 'File Excel không có dữ liệu.' });
            setLoading(false);
            setIsLoading(false);
            return;
          }

          setImportProgress({ current: 0, total: totalItems });

          // 1. Fetch all existing items to check for duplicates
          // We'll map by QRCODE (primary) and SO|RPRO (secondary fallback)
          const existingByQR = new Map<string, any>(); // qr_code -> full item
          const existingBySORPRO = new Map<string, any[]>(); // so|rpro -> list of items
          
          let offset = 0;
          const fetchLimit = 5000;
          let hasMoreExisting = true;
          
          setMessage({ type: 'success', text: 'Đang kiểm tra dữ liệu tồn kho hiện có...' });
          
          while (hasMoreExisting) {
            const { data: batch, error: fetchError } = await supabase
              .from('inventory_balances')
              .select('*')
              .range(offset, offset + fetchLimit - 1);
            
            if (fetchError) throw fetchError;
            if (!batch || batch.length === 0) {
              hasMoreExisting = false;
            } else {
              batch.forEach(item => {
                if (item.qr_code) {
                  existingByQR.set(item.qr_code, item);
                }
                const key = `${item.so || ''}|${item.rpro || ''}`;
                if (!existingBySORPRO.has(key)) {
                  existingBySORPRO.set(key, []);
                }
                existingBySORPRO.get(key)!.push(item);
              });
              offset += fetchLimit;
            }
          }

          // 2. Fetch expected quantities from source_import_lines
          const uniqueSORPROs = new Set<string>();
          data.forEach(row => {
            const so = String(row['SO'] || row['so'] || '').trim();
            const rpro = String(row['RPRO'] || row['rpro'] || '').trim();
            if (so || rpro) uniqueSORPROs.add(`${so}|${rpro}`);
          });

          const expectedMap = new Map<string, number>();
          if (uniqueSORPROs.size > 0) {
            const soList = Array.from(uniqueSORPROs).map(k => k.split('|')[0]).filter(Boolean);
            const rproList = Array.from(uniqueSORPROs).map(k => k.split('|')[1]).filter(Boolean);
            
            const { data: sourceData } = await supabase
              .from('source_import_lines')
              .select('so, rpro, quantity')
              .or(`so.in.(${soList.map(s => `"${s}"`).join(',')}),rpro.in.(${rproList.map(r => `"${r}"`).join(',')})`);
            
            sourceData?.forEach(s => {
              expectedMap.set(`${s.so || ''}|${s.rpro || ''}`, s.quantity || 0);
            });
          }

          // 3. Process Excel data
          // We use a map to deduplicate within the file itself
          const fileDataMap = new Map<string, any>();
          const currentCountInFile = new Map<string, number>();
          const usedExistingIds = new Set<string>();

          // Track current counts in DB to check against limits
          const dbCountMap = new Map<string, number>();
          // Let's fetch actual counts for the relevant SO/RPROs
          if (uniqueSORPROs.size > 0) {
            const soList = Array.from(uniqueSORPROs).map(k => k.split('|')[0]).filter(Boolean);
            const rproList = Array.from(uniqueSORPROs).map(k => k.split('|')[1]).filter(Boolean);
            
            const { data: countsData } = await supabase
              .from('inventory_balances')
              .select('so, rpro')
              .or(`so.in.(${soList.map(s => `"${s}"`).join(',')}),rpro.in.(${rproList.map(r => `"${r}"`).join(',')})`);
            
            countsData?.forEach(c => {
              const key = `${c.so || ''}|${c.rpro || ''}`;
              dbCountMap.set(key, (dbCountMap.get(key) || 0) + 1);
            });
          }

          let skippedOverLimit = 0;

          data.forEach((row, index) => {
            const so = String(row['SO'] || row['so'] || '').trim();
            const rpro = String(row['RPRO'] || row['rpro'] || '').trim();
            const qrCodeFromExcel = String(row['QRCODE'] || row['qrcode'] || row['qr_code'] || '').trim();
            
            if (!so && !rpro && !qrCodeFromExcel) return;

            const sorproKey = `${so}|${rpro}`;
            
            // 3a. Determine if this row matches an existing record
            let matchedItem: any = null;
            if (qrCodeFromExcel) {
              matchedItem = existingByQR.get(qrCodeFromExcel);
            }
            
            // If no QR match, try matching by SO|RPRO if QR is missing in Excel
            if (!matchedItem && !qrCodeFromExcel) {
              const possibleItems = existingBySORPRO.get(sorproKey) || [];
              matchedItem = possibleItems.find(item => !usedExistingIds.has(item.id));
            }

            const isUpdate = !!matchedItem;
            if (matchedItem) {
              usedExistingIds.add(matchedItem.id);
            }
            
            // 3b. Check limits for NEW items
            if (!isUpdate) {
              const expected = expectedMap.get(sorproKey) || 0;
              const currentInDB = dbCountMap.get(sorproKey) || 0;
              const currentInFile = currentCountInFile.get(sorproKey) || 0;

              if (expected > 0 && (currentInDB + currentInFile) >= expected) {
                skippedOverLimit++;
                return; // Skip this row as it exceeds the limit
              }
              currentCountInFile.set(sorproKey, currentInFile + 1);
            }

            const boxType = row['LOẠI THÙNG'] || row['loại thùng'] || row['box_type'] || '';
            const location = row['VỊ TRÍ'] || row['vị trí'] || row['location_path'] || '';
            const kh = row['KHÁCH HÀNG'] || row['khách hàng'] || row['kh'] || '';
            
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

            // CRITICAL FIX: Use a unique key for each row in fileDataMap
            const fileKey = qrCodeFromExcel || `${sorproKey}|row-${index}`;

            fileDataMap.set(fileKey, {
              id: matchedItem?.id,
              so,
              rpro,
              kh,
              box_type: boxType,
              location_path: location,
              quantity,
              total_boxes: totalBoxes || expectedMap.get(sorproKey) || 0,
              qr_code: qrCodeFromExcel || matchedItem?.qr_code || `${so}|${rpro}|${Math.random().toString(36).substring(2, 7)}`,
              last_updated: new Date().toISOString()
            });
          });

          // 4. Prepare final list for upsert
          const itemsToUpsert = Array.from(fileDataMap.values());

          const totalToProcess = itemsToUpsert.length;
          setImportProgress({ current: 0, total: totalToProcess });

          // 4. Chunking upserts
          const chunkSize = 1000;
          let successCount = 0;

          for (let i = 0; i < itemsToUpsert.length; i += chunkSize) {
            const chunk = itemsToUpsert.slice(i, i + chunkSize);
            const { error } = await supabase
              .from('inventory_balances')
              .upsert(chunk, { onConflict: 'qr_code' }); // CRITICAL: Use onConflict to prevent duplicates
            
            if (error) {
              console.error('Error upserting chunk:', error);
              throw new Error(`Lỗi tại đợt ${Math.floor(i / chunkSize) + 1}: ${error.message}`);
            }
            
            successCount += chunk.length;
            setImportProgress({ current: successCount, total: totalToProcess });
          }

          setMessage({ 
            type: 'success', 
            text: `Đã cập nhật thành công ${successCount} mục tồn kho.${skippedOverLimit > 0 ? ` Đã chặn ${skippedOverLimit} kiện hàng vượt định mức.` : ''}` 
          });
          fetchInventory();
        } catch (error: any) {
          console.error('Import error:', error);
          setMessage({ type: 'error', text: 'Lỗi khi nhập: ' + error.message });
        } finally {
          setLoading(false);
          setIsLoading(false);
          setImportProgress(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      reader.readAsBinaryString(file);
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi đọc file: ' + error.message });
      setLoading(false);
      setIsLoading(false);
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
          quantity: 1,
          // For total_boxes, we take the value from the first item in the group
          total_boxes: item.total_boxes || 0,
          locationCounts: {} as Record<string, number>,
          last_updated: item.last_updated
        };
        const loc = item.location_path || 'Chưa có';
        groups[key].locationCounts[loc] = 1;
      } else {
        groups[key].ids.push(item.id);
        groups[key].quantity += 1;
        
        // Use the largest total_boxes found in the group
        if (item.total_boxes && item.total_boxes > groups[key].total_boxes) {
          groups[key].total_boxes = item.total_boxes;
        }
        
        const loc = item.location_path || 'Chưa có';
        groups[key].locationCounts[loc] = (groups[key].locationCounts[loc] || 0) + 1;
        
        if (new Date(item.last_updated) > new Date(groups[key].last_updated)) {
          groups[key].last_updated = item.last_updated;
        }
      }
    });

    return Object.values(groups).map(group => {
      const locationStrings = Object.entries(group.locationCounts)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([loc, count]) => `${loc}(${count})`);

      return {
        ...group,
        location_path: locationStrings.join(', ')
      };
    });
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

  const downloadTemplate = () => {
    const templateData = [
      {
        'SO': 'SO12345',
        'RPRO': 'RPRO-001',
        'KHÁCH HÀNG': 'Công ty A',
        'LOẠI THÙNG': 'Thùng nhựa',
        'SỐ THÙNG ĐƠN HÀNG': '1/10',
        'VỊ TRÍ': 'A-01-01-01',
        'QRCODE': 'SO12345|RPRO-001|1|10|ABCDE'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Mau_Nhap_Ton_Kho.xlsx');
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
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-6 py-3 bg-slate-600 text-white rounded-xl font-black hover:bg-slate-700 transition-all shadow-lg active:scale-95"
          >
            <Download className="w-5 h-5" />
            TẢI FILE MẪU
          </button>
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
