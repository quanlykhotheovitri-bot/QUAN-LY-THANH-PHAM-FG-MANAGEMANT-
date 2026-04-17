import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useLoading } from '../contexts/LoadingContext';
import { parseQRCode, clearAppCache } from '../lib/utils';
import QRScanner from '../components/QRScanner';
import { 
  Scan, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Trash2,
  Package,
  MapPin,
  User,
  Hash,
  Download,
  Upload,
  Settings,
  History as HistoryIcon,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, SourceImportLine } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

export default function Inbound() {
  const { user: authUser } = useAuth();
  const { setIsLoading } = useLoading();
  const isAdmin = authUser?.role === 'admin';
  const isViewer = authUser?.role === 'viewer';
  const [scannedItems, setScannedItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('inbound_scanned_items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('inbound_scanned_items', JSON.stringify(scannedItems));
  }, [scannedItems]);
  const [selectedScanned, setSelectedScanned] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [selectedBoxType, setSelectedBoxType] = useState<'Nhựa' | 'Giấy'>('Nhựa');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [manualQR, setManualQR] = useState('');
  const [scannedSearch, setScannedSearch] = useState('');
  const [scannedStatusFilter, setScannedStatusFilter] = useState<'all' | 'ok' | 'wrong'>('all');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [orderStatusMap, setOrderStatusMap] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<'all' | 'complete' | 'incomplete'>('all');
  const [historySearch, setHistorySearch] = useState('');
  const historyPageSize = 50;

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      const timer = setTimeout(() => {
        if (historyPage === 1) {
          fetchHistory();
        } else {
          setHistoryPage(1);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [activeTab, historyPage, historySearch]);

  const filteredHistory = historyData.filter(item => {
    const status = orderStatusMap[`${item.so}|${item.rpro}`] || '';
    
    // Status filter (dropdown)
    let matchesStatus = true;
    if (statusFilter === 'complete') matchesStatus = status === 'Đủ đơn';
    else if (statusFilter === 'incomplete') matchesStatus = status && status.startsWith('Thiếu');
    
    if (!matchesStatus) return false;

    // Search filter (text)
    if (!historySearch.trim()) return true;
    
    const searchLower = historySearch.toLowerCase().trim();
    return (
      item.so?.toLowerCase().includes(searchLower) ||
      item.rpro?.toLowerCase().includes(searchLower) ||
      item.qr_code?.toLowerCase().includes(searchLower) ||
      item.kh?.toLowerCase().includes(searchLower) ||
      status.toLowerCase().includes(searchLower)
    );
  });

  const exportHistory = (format: 'xlsx' | 'csv') => {
    const data = filteredHistory.map(item => ({
      'QRCODE': item.qr_code,
      'DATE': formatDate(item.created_at),
      'OVN Order No': item.so,
      'RPRO': item.rpro,
      'TÌNH TRẠNG': orderStatusMap[`${item.so}|${item.rpro}`] || '',
      'LOẠI THÙNG': item.box_type,
      'SỐ THÙNG ĐƠN HÀNG': item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity,
      'VỊ TRÍ': item.location_path,
      'NGƯỜI NHẬP': item.user_email
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InboundHistory');
    XLSX.writeFile(wb, `InboundHistory_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  const getStatus = (item: any) => {
    const statusText = orderStatusMap[`${item.so}|${item.rpro}`];
    if (!statusText) return { status: 'Chưa có thông tin', class: 'text-slate-400' };
    if (statusText === 'Đủ đơn') return { status: 'OK', class: 'text-emerald-600' };
    return { status: 'Wrong', class: 'text-rose-600' };
  };

  const filteredScanned = scannedItems.filter(item => {
    // Search filter
    if (scannedSearch.trim()) {
      const searchLower = scannedSearch.toLowerCase().trim();
      const matchesSearch = 
        item.qrCode?.toLowerCase().includes(searchLower) ||
        item.so?.toLowerCase().includes(searchLower) ||
        item.rpro?.toLowerCase().includes(searchLower) ||
        item.kh?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    const status = getStatus(item).status;
    if (scannedStatusFilter === 'ok') return status === 'OK' || status === 'Đúng';
    if (scannedStatusFilter === 'wrong') return status === 'Wrong' || status === 'Sai' || status === 'Chưa có thông tin';
    
    return true;
  });

  async function fetchHistory() {
    setHistoryLoading(true);
    setIsLoading(true);
    const from = (historyPage - 1) * historyPageSize;
    const to = from + historyPageSize - 1;

    let query = supabase
      .from('inbound_transactions')
      .select('*', { count: 'exact' });

    if (historySearch.trim()) {
      const search = historySearch.trim();
      query = query.or(`so.ilike.%${search}%,rpro.ilike.%${search}%,kh.ilike.%${search}%,qr_code.ilike.%${search}%`);
    }

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi tải lịch sử: ' + error.message });
    } else if (data) {
      // Calculate status for each SO/RPRO
      const uniqueSORPRO = Array.from(new Set(data.map(item => `${item.so}|${item.rpro}`)));
      
      const statusMap: Record<string, string> = {};

      if (uniqueSORPRO.length > 0) {
        // Fetch all boxes for these SO/RPROs to check completeness
        const { data: allRelated } = await supabase
          .from('inbound_transactions')
          .select('qr_code, so, rpro')
          .or(uniqueSORPRO.map(key => {
            const [so, rpro] = key.split('|');
            return `and(so.eq."${so}",rpro.eq."${rpro}")`;
          }).join(','));

        uniqueSORPRO.forEach(key => {
          const [so, rpro] = key.split('|');
          const relatedBoxes = allRelated?.filter(b => b.so === so && b.rpro === rpro) || [];
          const itemInPage = data.find(d => d.so === so && d.rpro === rpro);
          const total = itemInPage?.total_boxes || 0;
          
          if (total <= 0) {
            statusMap[key] = 'Đủ đơn';
            return;
          }

          const presentBoxes = new Set<number>();
          relatedBoxes.forEach(b => {
            const parsed = parseQRCode(b.qr_code);
            presentBoxes.add(parsed.quantity); // quantity is boxNumber now
          });

          const missing = [];
          for (let i = 1; i <= total; i++) {
            if (!presentBoxes.has(i)) {
              missing.push(i);
            }
          }

          if (missing.length === 0) {
            statusMap[key] = 'Đủ đơn';
          } else {
            statusMap[key] = `Thiếu thùng số ${missing.join(', ')}`;
          }
        });
      }

      setOrderStatusMap(statusMap);
      setHistoryData(data.map(item => ({
        ...item,
        so: item.so?.trim() || '',
        rpro: item.rpro?.trim() || '',
        qr_code: item.qr_code?.trim() || ''
      })));
      if (count !== null) setHistoryTotal(count);
    }
    setHistoryLoading(false);
    setIsLoading(false);
  }

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  const matchedLocation = locations.find(l => l.full_path.trim().toLowerCase() === locationInput.trim().toLowerCase());

  const handleScan = async (qrData: string) => {
    const trimmedQR = qrData.trim();
    const matchedLoc = locations.find(l => l.full_path.trim().toLowerCase() === trimmedQR.toLowerCase());
    
    if (matchedLoc) {
      setLocationInput(matchedLoc.full_path);
      setMessage({ type: 'success', text: `Đã nhận diện vị trí: ${matchedLoc.full_path}` });
      setIsScanning(false);
      return;
    }

    processSingleQR(trimmedQR);
    setIsScanning(false);
  };

  const processSingleQR = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) {
      return;
    }

    // 1. Check if already in inventory
    const { data: existingInDB } = await supabase
      .from('inventory_balances')
      .select('id')
      .eq('qr_code', parsed.qrCode)
      .single();

    if (existingInDB) {
      setMessage({ type: 'error', text: `Kiện hàng ${parsed.qrCode} đã tồn tại trong kho.` });
      return;
    }

    // 2. Fetch matching info and check quantity
    const { data: sourceMatches } = await supabase
      .from('source_import_lines')
      .select('kh, quantity')
      .or(`rpro.eq."${parsed.rpro}",so.eq."${parsed.so}"`);

    const sourceMatch = sourceMatches?.[0];
    let kh = '';
    let totalBoxes = parsed.totalBoxes;

    if (sourceMatch) {
      kh = sourceMatch.kh || '';
      const expectedQty = sourceMatch.quantity || 0;
      
      if (totalBoxes <= 1 && expectedQty > 0) {
        totalBoxes = expectedQty;
      }

      // Check current count in DB
      const { count: dbCount } = await supabase
        .from('inventory_balances')
        .select('*', { count: 'exact', head: true })
        .eq('so', parsed.so)
        .eq('rpro', parsed.rpro);

      // Check count in current waiting list
      const waitingCount = scannedItems.filter(item => 
        item.so === parsed.so && 
        item.rpro === parsed.rpro && 
        item.qrCode !== parsed.qrCode
      ).length;

      const currentTotal = (dbCount || 0) + waitingCount;

      if (expectedQty > 0 && currentTotal >= expectedQty) {
        setMessage({ 
          type: 'error', 
          text: `CHẶN NHẬP: RPRO ${parsed.rpro} đã đủ số lượng (${expectedQty}/${expectedQty}). Không thể nhập thêm kiện hàng này.` 
        });
        return;
      }
    }

    const newItem = {
      ...parsed,
      kh,
      totalBoxes,
      boxType: selectedBoxType,
      locationPath: matchedLocation?.full_path || locationInput,
    };

    setScannedItems(prev => [newItem, ...prev]);
  };

  const [skippedItems, setSkippedItems] = useState<any[]>([]);
  const [showWarning, setShowWarning] = useState(false);

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').filter(line => line.trim() !== '');
    processLines(lines);
  };

  const handleImportExcel = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        
        const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
        if (rawRows.length === 0) {
          setMessage({ type: 'error', text: 'File Excel không có dữ liệu.' });
          setIsLoading(false);
          return;
        }

        const lines: string[] = [];
        rawRows.forEach(row => {
          const rowValues = row.map(v => String(v || '').trim()).filter(Boolean);
          if (rowValues.length === 0) return;
          
          const qrValue = rowValues.find(v => v.includes('|'));
          if (qrValue) {
            lines.push(qrValue);
          } else {
            lines.push(rowValues[0]);
          }
        });

        processLines(lines);
      } catch (err: any) {
        setMessage({ type: 'error', text: 'Lỗi đọc file Excel: ' + err.message });
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = ''; // Reset input
  };

  const processLines = async (lines: string[]) => {
    setLoading(true);
    setIsLoading(true);
    setSkippedItems([]);
    
    let currentLocation = matchedLocation?.full_path || locationInput || '';
    
    // Use a local set to track what we've added in this session to avoid duplicates
    const existingQRs = new Set(scannedItems.map(item => item.qrCode));
    const currentSkipped: any[] = [];

    try {
      const newItems: any[] = [];
      const existingInBatch = new Set(scannedItems.map(item => item.qrCode));

      // Fetch source data for current batch
      const qrParsed = lines.filter(l => l.includes('|')).map(l => parseQRCode(l));
      const sos = qrParsed.map(p => p.so).filter(Boolean);
      const rpros = qrParsed.map(p => p.rpro).filter(Boolean);

      let sourceData: any[] = [];
      if (sos.length > 0 || rpros.length > 0) {
        const { data } = await supabase
          .from('source_import_lines')
          .select('so, rpro, quantity, kh')
          .or(`so.in.(${sos.map(s => `"${s}"`).join(',')}),rpro.in.(${rpros.map(r => `"${r}"`).join(',')})`);
        if (data) sourceData = data;
      }

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;
        
        if (!trimmedLine.includes('|')) {
          currentLocation = trimmedLine;
          if (!locationInput) setLocationInput(currentLocation);
          continue;
        }

        const parsed = parseQRCode(trimmedLine);
        if (existingInBatch.has(parsed.qrCode)) continue;

        // Fetch KH 
        let kh = '';
        const sourceMatch = sourceData?.find(s => s.so === parsed.so && s.rpro === parsed.rpro);
        if (sourceMatch) kh = sourceMatch.kh || '';

        const newItem = {
          ...parsed,
          kh,
          totalBoxes: sourceMatch?.quantity || parsed.totalBoxes,
          boxType: selectedBoxType,
          locationPath: currentLocation,
        };

        newItems.push(newItem);
        existingInBatch.add(parsed.qrCode);
      }

      if (newItems.length > 0) {
        setScannedItems(prev => [...newItems, ...prev]);
      }

      if (currentSkipped.length > 0) {
        setSkippedItems(currentSkipped);
        setShowWarning(true);
      }

      setManualQR('');
    } catch (error: any) {
      console.error('Manual process error:', error);
      setMessage({ type: 'error', text: 'Lỗi xử lý: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleConfirmInbound = async () => {
    if (scannedItems.length === 0) return;
    
    // Check if all items have a location
    const missingLocation = scannedItems.some(item => !item.locationPath?.trim());
    if (missingLocation) {
      setMessage({ type: 'error', text: 'Vui lòng nhập vị trí lưu kho cho tất cả kiện hàng.' });
      return;
    }

    setLoading(true);
    setIsLoading(true);
    setMessage(null);
    
    try {
      const now = new Date().toISOString();
      const chunkSize = 500;
      
      for (let i = 0; i < scannedItems.length; i += chunkSize) {
        const chunk = scannedItems.slice(i, i + chunkSize);
        
        // 1. Inbound Transactions
        const txData = chunk.map(item => ({
          qr_code: item.qrCode,
          so: item.so,
          rpro: item.rpro,
          kh: item.kh,
          quantity: item.quantity || 1,
          box_type: item.boxType,
          total_boxes: item.totalBoxes || 0,
          location_path: item.locationPath,
          device_info: navigator.userAgent,
          status: 'completed'
        }));

        // 2. Inventory Balances (Upsert)
        const balanceData = chunk.map(item => ({
          qr_code: item.qrCode,
          so: item.so,
          rpro: item.rpro,
          kh: item.kh,
          quantity: item.quantity || 1,
          box_type: item.boxType,
          total_boxes: item.totalBoxes || 0,
          location_path: item.locationPath,
          last_updated: now
        }));

        // 3. Movement logs
        const movementData = chunk.map(item => ({
          type: 'INBOUND',
          qr_code: item.qrCode,
          to_location: item.locationPath,
          quantity: item.quantity || 1,
          remark: 'Nhập kho (Bulk Processing)'
        }));

        const [txResult, balanceResult, movementResult] = await Promise.all([
          supabase.from('inbound_transactions').insert(txData),
          supabase.from('inventory_balances').upsert(balanceData, { onConflict: 'qr_code' }),
          supabase.from('inventory_movements').insert(movementData)
        ]);

        if (txResult.error) throw txResult.error;
        if (balanceResult.error) throw balanceResult.error;
        if (movementResult.error) throw movementResult.error;
      }

      setMessage({ type: 'success', text: `Đã nhập kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
      setSelectedScanned(new Set());
      clearAppCache();
      
      if (activeTab === 'history') {
        fetchHistory();
      }
    } catch (error: any) {
      console.error('Inbound process error:', error);
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: errorMsg || 'Có lỗi xảy ra khi nhập kho.' });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const toggleSelectScanned = (qrCode: string) => {
    const newSelected = new Set(selectedScanned);
    if (newSelected.has(qrCode)) {
      newSelected.delete(qrCode);
    } else {
      newSelected.add(qrCode);
    }
    setSelectedScanned(newSelected);
  };

  const toggleSelectAllScanned = () => {
    if (selectedScanned.size === scannedItems.length) {
      setSelectedScanned(new Set());
    } else {
      setSelectedScanned(new Set(scannedItems.map(item => item.qrCode)));
    }
  };

  const deleteSelectedScanned = () => {
    setScannedItems(prev => prev.filter(item => !selectedScanned.has(item.qrCode)));
    setSelectedScanned(new Set());
  };

  const toggleSelectHistory = (id: string) => {
    const newSelected = new Set(selectedHistory);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedHistory(newSelected);
  };

  const toggleSelectAllHistory = () => {
    if (selectedHistory.size === historyData.length) {
      setSelectedHistory(new Set());
    } else {
      setSelectedHistory(new Set(historyData.map(item => item.id)));
    }
  };

  const deleteHistoryItem = async (id: string) => {
    const { error } = await supabase.from('inbound_transactions').delete().eq('id', id);
    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + errorMsg });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi thành công.' });
      fetchHistory();
    }
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistory.size === 0) return;
    
    const { error } = await supabase
      .from('inbound_transactions')
      .delete()
      .in('id', Array.from(selectedHistory));

    if (error) {
      const errorMsg = error.message.includes('Failed to fetch')
        ? 'Lỗi kết nối Supabase (Failed to fetch). Vui lòng kiểm tra cấu hình biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY trên Vercel.'
        : error.message;
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + errorMsg });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedHistory.size} bản ghi thành công.` });
      setSelectedHistory(new Set());
      fetchHistory();
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Modal for Skipped Items */}
      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200"
            >
              <div className="bg-rose-600 p-6 flex items-center justify-between">
                <div className="flex items-center gap-3 text-white">
                  <AlertCircle className="w-8 h-8" />
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Cảnh báo nhập thừa</h3>
                    <p className="text-rose-100 text-xs font-bold">Phát hiện {skippedItems.length} kiện hàng đã đủ số lượng trong kho</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowWarning(false)}
                  className="p-2 hover:bg-white/20 rounded-xl transition-colors text-white"
                >
                  <Trash2 className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                <div className="space-y-3">
                  {skippedItems.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-rose-50 rounded-2xl border border-rose-100">
                      <div className="space-y-1">
                        <div className="text-xs font-black text-rose-900 uppercase tracking-wider">{item.qrCode}</div>
                        <div className="flex gap-3 text-[10px] font-bold text-rose-600">
                          <span>SO: {item.so}</span>
                          <span>RPRO: {item.rpro}</span>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-rose-600 text-white text-[10px] font-black rounded-full uppercase">
                        {item.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setShowWarning(false)}
                  className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all shadow-lg"
                >
                  ĐÃ HIỂU VÀ ĐÓNG
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex p-1 bg-slate-100 rounded-2xl w-fit border border-slate-200">
          <button 
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'scan' 
                ? 'bg-white text-blue-600 shadow-sm border border-blue-100' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Scan className="w-4 h-4" />
            Nhập kho hàng hóa
          </button>
          {(isAdmin || isViewer) && (
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'history' 
                  ? 'bg-white text-blue-600 shadow-sm border border-blue-100' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              DATA NHẬP KHO
            </button>
          )}
        </div>
        {activeTab === 'scan' && (
          <div className="flex flex-wrap gap-2">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <button
                onClick={() => setSelectedBoxType('Nhựa')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  selectedBoxType === 'Nhựa' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                THÙNG NHỰA
              </button>
              <button
                onClick={() => setSelectedBoxType('Giấy')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  selectedBoxType === 'Giấy' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                THÙNG GIẤY
              </button>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'scan' ? (
        <>
          <AnimatePresence>
            {isScanning && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-slate-900 p-4 rounded-2xl mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-bold uppercase tracking-wider">
                      Đang ở chế độ: Scan
                    </span>
                    <span className="text-emerald-400 text-sm font-bold">
                      Loại thùng: {selectedBoxType}
                    </span>
                  </div>
                  <QRScanner onScan={handleScan} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Manual Input & Settings */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
                <div className="flex items-center gap-2 mb-6 bg-blue-600 p-3 rounded-xl shadow-md">
                  <Settings className="w-5 h-5 text-white" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình quét</h2>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Dán mã QR (Thủ công)</label>
                    <textarea
                      value={manualQR}
                      onChange={(e) => setManualQR(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24"
                      placeholder="Dán dữ liệu QR tại đây... (Mỗi dòng 1 mã)"
                    />
                    <button
                      onClick={handleProcessManual}
                      className="w-full mt-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-all shadow-md"
                    >
                      Xử lý mã
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nhập từ Excel</label>
                    <label className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black hover:bg-slate-50 transition-all cursor-pointer shadow-sm">
                      <Upload className="w-4 h-4 text-blue-600" />
                      CHỌN FILE EXCEL
                      <input
                        type="file"
                        accept=".xlsx, .xls"
                        onChange={handleImportExcel}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vị trí lưu kho</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        placeholder="Nhập hoặc scan vị trí..."
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                      <div className="absolute right-3 top-2.5">
                        <MapPin className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                    <p className="mt-1 text-[10px] text-slate-400 italic">Gợi ý: Bạn có thể scan mã vị trí trực tiếp vào ô này.</p>
                  </div>
                </div>
              </div>

              {scannedItems.length > 0 && (
                <button
                  onClick={handleConfirmInbound}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-6 h-6" />
                      LƯU VÀO KHO {scannedSearch || scannedStatusFilter !== 'all' ? `(${filteredScanned.length}/${scannedItems.length})` : `(${scannedItems.length})`}
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

            {/* Scanned List */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border-2 border-emerald-500 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-emerald-100 flex items-center justify-between bg-emerald-600 shadow-md">
                  <h2 className="text-lg font-bold text-white uppercase tracking-tight">
                    Danh sách chờ nhập {scannedSearch || scannedStatusFilter !== 'all' ? `(${filteredScanned.length}/${scannedItems.length})` : `(${scannedItems.length})`}
                  </h2>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/50" />
                      <input
                        type="text"
                        placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                        value={scannedSearch}
                        onChange={(e) => setScannedSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs text-white placeholder:text-white/50 focus:bg-white/20 outline-none w-32 md:w-48 transition-all"
                      />
                    </div>
                    <select
                      value={scannedStatusFilter}
                      onChange={(e: any) => setScannedStatusFilter(e.target.value)}
                      className="px-2 py-1.5 bg-white/10 border border-white/20 rounded-lg text-xs font-bold text-white focus:bg-white/20 outline-none cursor-pointer appearance-none min-w-[80px]"
                    >
                      <option value="all" className="text-slate-900">TẤT CẢ STATUS</option>
                      <option value="ok" className="text-emerald-600 font-bold">OK</option>
                      <option value="wrong" className="text-rose-600 font-bold">WRONG</option>
                    </select>
                    {isAdmin && selectedScanned.size > 0 && (
                      <button
                        onClick={deleteSelectedScanned}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white/20 text-white rounded-lg text-xs font-black hover:bg-white/30 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        XÓA ĐÃ CHỌN ({selectedScanned.size})
                      </button>
                    )}
                    {scannedItems.length > 0 && (
                      <button
                        onClick={handleConfirmInbound}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-600 rounded-xl text-sm font-black hover:bg-emerald-50 transition-all disabled:opacity-50 shadow-md"
                      >
                        <Save className="w-4 h-4" />
                        LƯU VÀO KHO
                      </button>
                    )}
                    {isAdmin && (
                      <button 
                        onClick={() => setScannedItems([])}
                        className="p-2 text-white/70 hover:text-white transition-colors"
                        title="Xóa tất cả"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  {scannedItems.length === 0 ? (
                    <div className="p-12 text-center">
                      <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                      <p className="text-slate-400">Chưa có kiện hàng nào được scan</p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-[#002060] text-white">
                          <th className="px-2 py-3 border border-slate-300 text-center">
                            {isAdmin && (
                              <input 
                                type="checkbox" 
                                checked={selectedScanned.size === scannedItems.length && scannedItems.length > 0}
                                onChange={toggleSelectAllScanned}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            )}
                          </th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">TÌNH TRẠNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                          <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
                          <th className="px-2 py-3 border border-slate-300"></th>
                        </tr>
                      </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredScanned.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-12 text-center">
                            <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                            <p className="text-slate-400 italic text-sm">Không tìm thấy dữ liệu phù hợp</p>
                          </td>
                        </tr>
                      ) : (
                        filteredScanned.map((item, index) => (
                          <tr 
                            key={item.qrCode}
                            className={`hover:bg-slate-50 transition-colors ${selectedScanned.has(item.qrCode) ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {isAdmin && (
                                <input 
                                  type="checkbox" 
                                  checked={selectedScanned.has(item.qrCode)}
                                  onChange={() => toggleSelectScanned(item.qrCode)}
                                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                />
                              )}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 font-medium text-slate-700">{item.qrCode}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.so}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.rpro}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center font-medium text-slate-600">
                              {orderStatusMap[`${item.so}|${item.rpro}`] || 'Đang kiểm tra...'}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.boxType}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center font-bold">
                              {item.totalBoxes > 0 ? `1 / ${item.totalBoxes}` : '1'}
                            </td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{item.locationPath}</td>
                            <td className="px-4 py-4 text-sm border border-slate-200 text-center">{new Date(item.date).toLocaleString('vi-VN')}</td>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {isAdmin && (
                                <button 
                                  onClick={() => setScannedItems(prev => prev.filter(i => i.qrCode !== item.qrCode))}
                                  className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                      {filteredScanned.length > 100 && (
                        <tr>
                          <td colSpan={10} className="px-4 py-6 text-center text-slate-400 italic bg-slate-50">
                            Đang hiển thị 100/{filteredScanned.length} kiện hàng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-sm overflow-hidden">
          <div className="p-4 md:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between bg-blue-50/50 gap-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full md:w-auto">
              <h2 className="text-lg font-bold text-blue-900">Lịch sử nhập kho</h2>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-2 bg-white border-2 border-blue-100 text-blue-900 rounded-lg text-xs font-bold focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                >
                  <option value="all">Tất cả tình trạng</option>
                  <option value="complete">Đủ đơn</option>
                  <option value="incomplete">Thiếu thùng</option>
                </select>
                <div className="relative flex-1 sm:min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm SO, RPRO, Khách hàng..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white border-2 border-blue-100 text-blue-900 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 transition-all shadow-sm"
                  />
                </div>
              </div>
              {isAdmin && selectedHistory.size > 0 && (
                <button
                  onClick={deleteSelectedHistory}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa ({selectedHistory.size})
                </button>
              )}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button 
                onClick={() => exportHistory('xlsx')}
                className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                Excel
              </button>
              <button 
                onClick={() => exportHistory('csv')}
                className="flex-1 sm:flex-none px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                CSV
              </button>
              <button 
                onClick={() => fetchHistory()}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            {historyLoading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Đang tải dữ liệu...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">Chưa có dữ liệu nhập kho</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-[#002060] text-white">
                    <th className="px-2 py-3 border border-slate-300 text-center">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedHistory.size === historyData.length && historyData.length > 0}
                          onChange={toggleSelectAllHistory}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KH</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">TÌNH TRẠNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredHistory.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedHistory.has(item.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        {isAdmin && (
                          <input 
                            type="checkbox" 
                            checked={selectedHistory.has(item.id)}
                            onChange={() => toggleSelectHistory(item.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">{item.qr_code}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase">{item.so}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase">{item.rpro}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase font-bold text-blue-600">{item.kh || '-'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-medium text-slate-600">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          orderStatusMap[`${item.so}|${item.rpro}`] === 'Đủ đơn' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {orderStatusMap[`${item.so}|${item.rpro}`] || 'Đang kiểm tra...'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.box_type}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">
                        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.location_path || 'N/A'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        {isAdmin && (
                          <button 
                            onClick={() => deleteHistoryItem(item.id)}
                            className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-slate-100">
            {historyLoading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-slate-400">Đang tải dữ liệu...</p>
              </div>
            ) : historyData.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">Chưa có dữ liệu nhập kho</p>
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div key={item.id} className={`p-4 space-y-3 ${selectedHistory.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {isAdmin && (
                        <input 
                          type="checkbox" 
                          checked={selectedHistory.has(item.id)}
                          onChange={() => toggleSelectHistory(item.id)}
                          className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      )}
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.so}</div>
                        <div className="text-xs font-bold text-blue-600">{item.rpro}</div>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => deleteHistoryItem(item.id)}
                        className="p-2 text-slate-300 hover:text-rose-500"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Tình trạng</div>
                      <div className="mt-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          orderStatusMap[`${item.so}|${item.rpro}`] === 'Đủ đơn' 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {orderStatusMap[`${item.so}|${item.rpro}`] || 'Đang kiểm tra...'}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Loại thùng</div>
                      <div className="text-xs font-bold text-slate-700">{item.box_type}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Số lượng</div>
                      <div className="text-xs font-black text-blue-700">
                        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-black text-slate-400 uppercase">Vị trí</div>
                      <div className="flex items-center gap-1 text-xs font-black text-emerald-600">
                        <MapPin className="w-3 h-3" />
                        {item.location_path || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold italic">
                    <span>Mã: {item.qr_code}</span>
                    <span>{new Date(item.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {historyData.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t-2 border-slate-200">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Hiển thị {Math.min(historyTotal, (historyPage - 1) * historyPageSize + 1)}-{Math.min(historyTotal, historyPage * historyPageSize)} trong {historyTotal}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setHistoryPage(prev => Math.max(1, prev - 1))}
                  disabled={historyPage === 1}
                  className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                >
                  TRƯỚC
                </button>
                <div className="flex items-center px-4 bg-white border-2 border-slate-200 rounded-xl text-xs font-black">
                  TRANG {historyPage} / {Math.ceil(historyTotal / historyPageSize) || 1}
                </div>
                <button
                  onClick={() => setHistoryPage(prev => Math.min(Math.ceil(historyTotal / historyPageSize), prev + 1))}
                  disabled={historyPage === Math.ceil(historyTotal / historyPageSize) || historyTotal === 0}
                  className="px-4 py-2 bg-white border-2 border-slate-200 rounded-xl text-xs font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                >
                  SAU
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
