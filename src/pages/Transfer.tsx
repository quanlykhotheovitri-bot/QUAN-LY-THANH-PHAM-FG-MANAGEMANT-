import { useState, useEffect } from 'react';
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
  PackagePlus,
  MapPin,
  ArrowRight,
  ChevronDown,
  History as HistoryIcon,
  Download,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

export default function Transfer() {
  const { user: authUser } = useAuth();
  const { setIsLoading } = useLoading();
  const isAdmin = authUser?.role === 'admin';
  const isViewer = authUser?.role === 'viewer';
  
  const [scannedItems, setScannedItems] = useState<any[]>(() => {
    const saved = localStorage.getItem('transfer_scanned_items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('transfer_scanned_items', JSON.stringify(scannedItems));
  }, [scannedItems]);

  const [selectedScanned, setSelectedScanned] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [selectedBoxType, setSelectedBoxType] = useState<'Nhựa' | 'Giấy' | 'N/A'>('N/A');
  const [manualQR, setManualQR] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyPageSize = 100;

  const [historySearch, setHistorySearch] = useState({
    qrCode: '',
    so: '',
    rpro: '',
    kh: ''
  });

  const [scannedPage, setScannedPage] = useState(1);
  const scannedPageSize = 20;

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyPage]);

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  async function fetchHistory() {
    setHistoryLoading(true);
    setIsLoading(true);
    const from = (historyPage - 1) * historyPageSize;
    const to = from + historyPageSize - 1;

    let query = supabase
      .from('inventory_movements')
      .select('*', { count: 'exact' })
      .eq('type', 'TRANSFER');

    if (historySearch.qrCode) query = query.ilike('qr_code', `%${historySearch.qrCode}%`);
    if (historySearch.so) query = query.ilike('so', `%${historySearch.so}%`);
    if (historySearch.rpro) query = query.ilike('rpro', `%${historySearch.rpro}%`);
    if (historySearch.kh) query = query.ilike('kh', `%${historySearch.kh}%`);

    const { data, count, error } = await query
      .order('created_at', { ascending: false })
      .range(from, to);
    
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi tải lịch sử: ' + error.message });
    } else if (data) {
      setHistoryData(data);
      if (count !== null) setHistoryTotal(count);
    }
    setHistoryLoading(false);
    setIsLoading(false);
  }

  const matchedLocation = locations.find(l => l.full_path.trim().toLowerCase() === locationInput.trim().toLowerCase());

  useEffect(() => {
    if (scannedItems.length > 0 && scannedItems.length < 500) {
      setScannedItems(prev => prev.map(item => ({
        ...item,
        toLocation: matchedLocation?.full_path || locationInput
      })));
    }
  }, [locationInput, matchedLocation]);

  const handleScan = async (qrData: string) => {
    const trimmedQR = qrData.trim();
    const matchedLoc = locations.find(l => l.full_path.trim().toLowerCase() === trimmedQR.toLowerCase());
    
    if (matchedLoc) {
      setLocationInput(matchedLoc.full_path);
      setMessage({ type: 'success', text: `Đã nhận diện vị trí đích: ${matchedLoc.full_path}` });
      setIsScanning(false);
      return;
    }

    processSingleQR(trimmedQR);
    setIsScanning(false);
  };

  const processSingleQR = async (qrData: string, targetLocation?: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) {
      return;
    }

    // Check if item exists in inventory
    let { data: inventoryItem, error } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('qr_code', parsed.qrCode)
      .maybeSingle();

    // Fallback: search by SO and RPRO if qr_code search failed
    if (!inventoryItem && parsed.so && parsed.rpro) {
      const { data: fallbackItems } = await supabase
        .from('inventory_balances')
        .select('*')
        .eq('so', parsed.so)
        .eq('rpro', parsed.rpro)
        .limit(1);
      
      if (fallbackItems && fallbackItems.length > 0) {
        inventoryItem = fallbackItems[0];
        error = null;
      }
    }

    const newItem = {
      ...parsed,
      id: inventoryItem?.id || null,
      kh: inventoryItem?.kh || 'N/A',
      fromLocation: inventoryItem?.location_path || 'N/A',
      toLocation: targetLocation || matchedLocation?.full_path || locationInput,
      quantity: inventoryItem?.quantity || parsed.quantity,
      boxType: inventoryItem?.box_type || 'N/A',
      status: (error || !inventoryItem) ? 'Wrong' : 'OK',
      note: (error || !inventoryItem) ? 'Không có trong tồn kho' : ''
    };

    if (newItem.status === 'Wrong') {
      setMessage({ type: 'error', text: `Kiện hàng ${parsed.qrCode} không tồn tại trong kho.` });
    }

    setScannedItems(prev => [newItem, ...prev]);
  };

  const handleProcessManual = async () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').filter(line => line.trim() !== '');
    let currentLocation = matchedLocation?.full_path || locationInput || '';
    
    setLoading(true);
    setIsLoading(true);
    
    try {
      const qrBatch: { raw: string, parsed: any, targetLoc: string }[] = [];
      const qrCodesToFetch: string[] = [];

      // 1. First pass: Parse and separate locations from QRs
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (!trimmedLine.includes('|')) {
          currentLocation = trimmedLine;
          if (!locationInput) setLocationInput(currentLocation);
          continue;
        }

        const parsed = parseQRCode(trimmedLine);
        if (scannedItems.some(item => item.qrCode === parsed.qrCode)) continue;
        
        qrBatch.push({ raw: trimmedLine, parsed, targetLoc: currentLocation });
        qrCodesToFetch.push(parsed.qrCode);
      }

      if (qrBatch.length === 0) {
        setManualQR('');
        setLoading(false);
        setIsLoading(false);
        return;
      }

      // 2. Batch fetch from inventory in chunks
      const inventoryItems: any[] = [];
      const fetchChunkSize = 500;
      
      for (let i = 0; i < qrCodesToFetch.length; i += fetchChunkSize) {
        const chunk = qrCodesToFetch.slice(i, i + fetchChunkSize);
        const { data, error } = await supabase
          .from('inventory_balances')
          .select('*')
          .in('qr_code', chunk);
        
        if (error) throw error;
        if (data) inventoryItems.push(...data);
      }

      const inventoryMap = new Map(inventoryItems?.map(inv => [inv.qr_code, inv]) || []);
      
      // 2.5 Batch fetch customer mapping from source_import_lines for missing inventory items
      const missingInInventory = qrBatch.filter(b => !inventoryMap.has(b.parsed.qrCode));
      const sourceMatches: any[] = [];
      
      if (missingInInventory.length > 0) {
        const sos = Array.from(new Set(missingInInventory.map(b => b.parsed.so).filter(Boolean)));
        const rpros = Array.from(new Set(missingInInventory.map(b => b.parsed.rpro).filter(Boolean)));
        
        for (let i = 0; i < sos.length; i += 200) {
          const chunk = sos.slice(i, i + 200);
          const { data } = await supabase.from('source_import_lines').select('so, rpro, kh, quantity').in('so', chunk);
          if (data) sourceMatches.push(...data);
        }
        for (let i = 0; i < rpros.length; i += 200) {
          const chunk = rpros.slice(i, i + 200);
          const { data } = await supabase.from('source_import_lines').select('so, rpro, kh, quantity').in('rpro', chunk);
          if (data) sourceMatches.push(...data);
        }
      }

      // 3. Construct new items
      const newItems = qrBatch.map(batchInfo => {
        const { parsed, targetLoc } = batchInfo;
        const inventoryItem = inventoryMap.get(parsed.qrCode);
        const sourceMatch = sourceMatches.find(s => 
          (parsed.rpro && s.rpro === parsed.rpro) || (parsed.so && s.so === parsed.so)
        );
        
        const kh = inventoryItem?.kh || sourceMatch?.kh || 'N/A';
        const expectedQty = sourceMatch?.quantity || 0;

        return {
          ...parsed,
          id: inventoryItem?.id || null,
          kh,
          fromLocation: inventoryItem?.location_path || 'N/A',
          toLocation: targetLoc || matchedLocation?.full_path || locationInput,
          quantity: inventoryItem?.quantity || parsed.quantity,
          boxType: inventoryItem?.box_type || 'N/A',
          totalBoxes: expectedQty || parsed.totalBoxes,
          status: (!inventoryItem) ? (sourceMatch ? 'OK' : 'Wrong') : 'OK',
          note: (!inventoryItem) ? (sourceMatch ? 'Mới - Chờ nhập kho' : 'Không có trong tồn kho & Không có trong nguồn') : ''
        };
      });

      // 4. Handle wrong items specifically if needed (optional feedback)
      const wrongCount = newItems.filter(i => i.status === 'Wrong').length;
      if (wrongCount > 0) {
        setMessage({ type: 'error', text: `Có ${wrongCount} kiện hàng không tìm thấy trong kho.` });
      } else {
        setMessage({ type: 'success', text: `Đã xử lý ${newItems.length} kiện hàng.` });
      }

      setScannedItems(prev => [...newItems, ...prev]);
      setManualQR('');
    } catch (err: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xử lý mã: ' + err.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const confirmTransfer = async () => {
    if (scannedItems.length === 0) return;
    
    const wrongItems = scannedItems.filter(item => item.status === 'Wrong');
    const itemsToProcess = scannedItems.filter(item => (item.toLocation || locationInput) && item.status === 'OK');
    
    if (itemsToProcess.length === 0 && wrongItems.length === 0) {
      setMessage({ type: 'error', text: 'Không có kiện hàng hợp lệ để xử lý (Vui lòng chọn vị trí đích).' });
      return;
    }

    if (wrongItems.length > 0 && itemsToProcess.length > 0) {
      if (!window.confirm(`Có ${wrongItems.length} kiện hàng bị lỗi sẽ bị bỏ qua. Bạn có chắc muốn tiếp tục xử lý ${itemsToProcess.length} kiện hợp lệ?`)) {
        return;
      }
    } else if (wrongItems.length > 0 && itemsToProcess.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng nhấn nút "CHUYỂN NHẬP KHO (MÃ LỖI)" để xử lý các mã này.' });
      return;
    }

    setLoading(true);
    setIsLoading(true);
    try {
      const now = new Date().toISOString();
      const existingItems = itemsToProcess.filter(item => item.id !== null);
      const newItems = itemsToProcess.filter(item => item.id === null);

      // 1. Process Transfers for existing items
      if (existingItems.length > 0) {
        const chunkSize = 1000;
        for (let i = 0; i < existingItems.length; i += chunkSize) {
          const chunk = existingItems.slice(i, i + chunkSize);
          const payload = {
            device_info: `Transfer Tab - ${authUser?.email || 'System'}`,
            items: chunk.map(item => ({
              id: item.id,
              qrCode: item.qrCode,
              so: item.so,
              rpro: item.rpro,
              kh: item.kh,
              fromLocation: item.fromLocation,
              toLocation: item.toLocation || locationInput,
              quantity: item.quantity,
              remark: `Chuyển vị trí hàng (Bulk RPC) - ${authUser?.email || 'System'}`
            }))
          };
          const { error: rpcError } = await supabase.rpc('process_transfer_v1', { p_data: payload });
          if (rpcError) throw rpcError;
        }
      }

      // 2. Process Inbounds for new items
      if (newItems.length > 0) {
        // Validation: If any new item has no boxType and selectedBoxType is N/A, warn user
        const needsBoxType = newItems.some(i => !i.boxType || i.boxType === 'N/A');
        if (needsBoxType && selectedBoxType === 'N/A') {
          throw new Error('Vui lòng chọn Loại thùng trong phần Cấu hình chuyển cho các kiện hàng mới.');
        }

        const chunkSize = 1000;
        for (let i = 0; i < newItems.length; i += chunkSize) {
          const chunk = newItems.slice(i, i + chunkSize);
          const payload = {
            device_info: `Transfer Tab Import - ${authUser?.email || 'System'}`,
            items: chunk.map(item => ({
              qrCode: item.qrCode,
              so: item.so,
              rpro: item.rpro,
              kh: item.kh,
              quantity: item.quantity,
              totalBoxes: item.totalBoxes,
              locationPath: item.toLocation || locationInput,
              boxType: item.boxType && item.boxType !== 'N/A' ? item.boxType : selectedBoxType
            }))
          };
          const { error: inboundError } = await supabase.rpc('process_inbound_v5', { p_data: payload });
          if (inboundError) throw inboundError;
        }
      }

      setMessage({ type: 'success', text: `Đã xử lý thành công ${itemsToProcess.length} kiện hàng (${existingItems.length} chuyển, ${newItems.length} nhập mới).` });
      
      const processedQrCodes = new Set(itemsToProcess.map(i => i.qrCode));
      setScannedItems(prev => prev.filter(item => !processedQrCodes.has(item.qrCode)));
      
      setSelectedScanned(prev => {
        const next = new Set(prev);
        processedQrCodes.forEach(qr => next.delete(qr));
        return next;
      });

      setScannedPage(1);
      clearAppCache();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi xử lý: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const handleForceInboundErrors = async () => {
    // Determine which items to process: those with a specific toLocation OR using the global locationInput
    const wrongItems = scannedItems.filter(item => item.status === 'Wrong' && (item.toLocation || locationInput));
    
    if (wrongItems.length === 0) {
      setMessage({ type: 'error', text: 'Vui lòng nhập Vị trí đích cho các mã lỗi trước khi thực hiện.' });
      return;
    }

    // Check for box type requirement
    if (selectedBoxType === 'N/A') {
      setMessage({ type: 'error', text: 'Vui lòng chọn Loại thùng trong phần Cấu hình chuyển trước khi nhập kho mã lỗi.' });
      return;
    }

    const targetLocation = locationInput;
    if (!window.confirm(`Bạn có chắc chắn muốn nhập kho ${wrongItems.length} kiện hàng bị lỗi này vào vị trí "${targetLocation || 'theo từng kiện'}" với loại thùng "${selectedBoxType}"? (Thông tin Khách hàng sẽ là N/A)`)) {
      return;
    }

    setLoading(true);
    setIsLoading(true);
    try {
      const chunkSize = 1000;
      for (let i = 0; i < wrongItems.length; i += chunkSize) {
        const chunk = wrongItems.slice(i, i + chunkSize);
        const payload = {
          device_info: `Transfer Tab Force Import - ${authUser?.email || 'System'}`,
          items: chunk.map(item => ({
            qrCode: item.qrCode,
            so: item.so,
            rpro: item.rpro,
            kh: 'N/A',
            quantity: item.quantity,
            totalBoxes: item.totalBoxes || 0,
            locationPath: item.toLocation || targetLocation,
            boxType: selectedBoxType
          }))
        };
        const { error: inboundError } = await supabase.rpc('process_inbound_v5', { p_data: payload });
        if (inboundError) throw inboundError;
      }

      setMessage({ type: 'success', text: `Đã nhập kho thành công ${wrongItems.length} kiện hàng lỗi.` });
      
      const processedQrCodes = new Set(wrongItems.map(i => i.qrCode));
      setScannedItems(prev => prev.filter(item => !processedQrCodes.has(item.qrCode)));
      
      setSelectedScanned(prev => {
        const next = new Set(prev);
        processedQrCodes.forEach(qr => next.delete(qr));
        return next;
      });

      setScannedPage(1);
      clearAppCache();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi nhập kho mã lỗi: ' + error.message });
    } finally {
      setLoading(false);
      setIsLoading(false);
    }
  };

  const toggleSelectScanned = (qrCode: string) => {
    const newSelected = new Set(selectedScanned);
    if (newSelected.has(qrCode)) newSelected.delete(qrCode);
    else newSelected.add(qrCode);
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
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
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
    const { error } = await supabase.from('inventory_movements').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: 'Đã xóa bản ghi thành công.' });
      fetchHistory();
    }
  };

  const deleteSelectedHistory = async () => {
    if (selectedHistory.size === 0) return;
    const { error } = await supabase
      .from('inventory_movements')
      .delete()
      .in('id', Array.from(selectedHistory));

    if (error) {
      setMessage({ type: 'error', text: 'Lỗi khi xóa: ' + error.message });
    } else {
      setMessage({ type: 'success', text: `Đã xóa ${selectedHistory.size} bản ghi thành công.` });
      setSelectedHistory(new Set());
      fetchHistory();
    }
  };

  const exportHistory = (format: 'xlsx' | 'csv') => {
    const data = historyData.map(item => ({
      'QRCODE': item.qr_code,
      'SO': item.so || '',
      'RPRO': item.rpro || '',
      'KH': item.kh || '',
      'DATE': formatDate(item.created_at),
      'FROM': item.from_location,
      'TO': item.to_location,
      'QUANTITY': item.quantity,
      'REMARK': item.remark
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'TransferHistory');
    XLSX.writeFile(wb, `TransferHistory_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex p-1 bg-slate-100 rounded-2xl w-fit border border-slate-200">
          <button
            onClick={() => setActiveTab('scan')}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'scan' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Scan className="w-4 h-4" />
            Chuyển vị trí hàng
          </button>
          {(isAdmin || isViewer) && (
            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                activeTab === 'history' ? 'bg-white text-blue-600 shadow-sm border border-blue-100' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              DATA CHUYỂN KHO
            </button>
          )}
        </div>
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
                  </div>
                  <QRScanner onScan={handleScan} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-2xl border-2 border-blue-500 shadow-lg">
                <div className="flex items-center gap-2 mb-6 bg-blue-600 p-3 rounded-xl shadow-md">
                  <Settings className="w-5 h-5 text-white" />
                  <h2 className="text-lg font-bold text-white tracking-tight">Cấu hình chuyển</h2>
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Vị trí đích</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value.toUpperCase())}
                        placeholder="Nhập hoặc scan vị trí..."
                        className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                        list="transfer-locations"
                      />
                      <div className="absolute right-3 top-2.5">
                        <MapPin className="w-4 h-4 text-slate-400" />
                      </div>
                      <datalist id="transfer-locations">
                        {locations.map(loc => (
                          <option key={loc.id} value={loc.full_path} />
                        ))}
                      </datalist>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Loại thùng (Cho mã mới/lỗi)</label>
                    <div className="relative">
                      <select
                        value={selectedBoxType}
                        onChange={(e) => setSelectedBoxType(e.target.value as any)}
                        className="w-full px-10 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold appearance-none"
                      >
                        <option value="N/A">Chọn loại thùng...</option>
                        <option value="Nhựa">Thùng Nhựa</option>
                        <option value="Giấy">Thùng Giấy</option>
                      </select>
                      <div className="absolute left-3 top-2.5">
                        <Package className="w-4 h-4 text-slate-400" />
                      </div>
                      <div className="absolute right-3 top-2.5 pointer-events-none">
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {scannedItems.length > 0 && (
                <button
                  onClick={confirmTransfer}
                  disabled={loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Save className="w-6 h-6" />
                      XÁC NHẬN CHUYỂN ({scannedItems.length})
                    </>
                  )}
                </button>
              )}

              {scannedItems.some(item => item.status === 'Wrong') && (
                <button
                  onClick={handleForceInboundErrors}
                  disabled={loading}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-100 flex items-center justify-center gap-2 transition-all mt-4 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <PackagePlus className="w-6 h-6" />
                      CHUYỂN NHẬP KHO ({scannedItems.filter(i => i.status === 'Wrong').length} MÃ LỖI)
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-2xl border-2 border-blue-500 shadow-lg overflow-hidden">
                <div className="p-6 border-b border-blue-100 flex items-center justify-between bg-blue-600 shadow-md">
                  <h2 className="text-lg font-bold text-white">Danh sách chờ chuyển ({scannedItems.length})</h2>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsScanning(!isScanning)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black text-sm transition-all ${
                        isScanning ? 'bg-rose-600 text-white' : 'bg-white text-blue-600 shadow-md'
                      }`}
                    >
                      <Scan className="w-4 h-4" />
                      {isScanning ? 'DỪNG QUÉT' : 'QUÉT MÃ'}
                    </button>
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
                        onClick={confirmTransfer}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-xl text-sm font-black hover:bg-blue-50 transition-all disabled:opacity-50 shadow-md"
                      >
                        <Save className="w-4 h-4" />
                        XÁC NHẬN CHUYỂN
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
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ CŨ</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ MỚI</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ LƯỢNG</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">TRẠNG THÁI</th>
                          <th className="px-2 py-3 border border-slate-300"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scannedItems.slice((scannedPage - 1) * scannedPageSize, scannedPage * scannedPageSize).map((item, index) => (
                          <tr 
                            key={item.qrCode} 
                            className={`hover:bg-slate-50 transition-colors ${selectedScanned.has(item.qrCode) ? 'bg-blue-50' : ''} ${item.status === 'Wrong' ? 'bg-rose-50' : ''}`}
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
                            <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">{item.qrCode}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                              <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">{item.fromLocation}</span>
                            </td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                              <span className={`px-2 py-1 rounded font-bold ${(item.toLocation || locationInput) ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-400 italic'}`}>
                                {item.toLocation || locationInput || 'Chưa có'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.rpro}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">{item.quantity}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-medium">
                              <span className={`px-2 py-1 rounded ${(item.boxType && item.boxType !== 'N/A') ? 'bg-slate-100 text-slate-700' : (selectedBoxType !== 'N/A' ? 'bg-blue-50 text-blue-700 font-bold' : 'bg-rose-50 text-rose-500 italic')}`}>
                                { (item.boxType && item.boxType !== 'N/A') ? item.boxType : (selectedBoxType !== 'N/A' ? selectedBoxType : 'Chưa có') }
                              </span>
                            </td>
                            <td className={`px-4 py-3 text-[11px] border border-slate-200 text-center font-bold ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              <div className="flex flex-col items-center">
                                <span>{item.status === 'OK' ? (item.id ? 'Hợp lệ' : 'Mới') : 'Lỗi'}</span>
                                {item.note && <span className="text-[9px] font-normal italic leading-tight text-slate-400 mt-0.5 whitespace-normal max-w-[150px]">{item.note}</span>}
                              </div>
                            </td>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              {!isViewer && (
                                <button 
                                  onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
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

                {scannedItems.length > scannedPageSize && (
                  <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">
                      Hiển thị {Math.min(scannedItems.length, (scannedPage - 1) * scannedPageSize + 1)}-{Math.min(scannedItems.length, scannedPage * scannedPageSize)} trong {scannedItems.length}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setScannedPage(prev => Math.max(1, prev - 1))}
                        disabled={scannedPage === 1}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                      >
                        TRƯỚC
                      </button>
                      <div className="flex items-center px-3 bg-white border border-slate-200 rounded-lg text-[10px] font-black">
                        {scannedPage} / {Math.ceil(scannedItems.length / scannedPageSize)}
                      </div>
                      <button
                        onClick={() => setScannedPage(prev => Math.min(Math.ceil(scannedItems.length / scannedPageSize), prev + 1))}
                        disabled={scannedPage === Math.ceil(scannedItems.length / scannedPageSize)}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black disabled:opacity-50 hover:bg-slate-50 transition-all"
                      >
                        SAU
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border-2 border-blue-600 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 bg-blue-50/50">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-lg font-bold text-blue-900 uppercase tracking-tight">Lịch sử chuyển vị trí</h2>
                  {isAdmin && selectedHistory.size > 0 && (
                    <button
                      onClick={deleteSelectedHistory}
                      className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa đã chọn ({selectedHistory.size})
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => exportHistory('xlsx')}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    Excel
                  </button>
                  <button 
                    onClick={fetchHistory}
                    className="p-2 text-blue-600 hover:bg-blue-200/50 rounded-lg transition-all"
                  >
                    <HistoryIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <input
                  type="text"
                  placeholder="Mã QR..."
                  value={historySearch.qrCode}
                  onChange={(e) => setHistorySearch(prev => ({ ...prev, qrCode: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                />
                <input
                  type="text"
                  placeholder="SO..."
                  value={historySearch.so}
                  onChange={(e) => setHistorySearch(prev => ({ ...prev, so: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                />
                <input
                  type="text"
                  placeholder="RPRO..."
                  value={historySearch.rpro}
                  onChange={(e) => setHistorySearch(prev => ({ ...prev, rpro: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                />
                <input
                  type="text"
                  placeholder="Khách hàng..."
                  value={historySearch.kh}
                  onChange={(e) => setHistorySearch(prev => ({ ...prev, kh: e.target.value }))}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold bg-white"
                />
                <button
                  onClick={() => { setHistoryPage(1); fetchHistory(); }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black hover:bg-blue-700 transition-all shadow-md active:scale-95"
                >
                  TÌM KIẾM
                </button>
              </div>
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
                <p className="text-slate-400">Chưa có dữ liệu chuyển kho</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-[#002060] text-white">
                    <th className="px-2 py-3 border border-slate-300 text-center">
                      <input 
                        type="checkbox" 
                        checked={selectedHistory.size === historyData.length && historyData.length > 0}
                        onChange={toggleSelectAllHistory}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KH</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ CŨ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ MỚI</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ LƯỢNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">GHI CHÚ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">THỜI GIAN</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {historyData.map((item) => (
                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${selectedHistory.has(item.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        <input 
                          type="checkbox" 
                          checked={selectedHistory.has(item.id)}
                          onChange={() => toggleSelectHistory(item.id)}
                          className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">{item.qr_code}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase">{item.so || '-'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase">{item.rpro || '-'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center uppercase font-bold text-blue-600">{item.kh || '-'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                        <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded">{item.from_location}</span>
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">
                        <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-bold">{item.to_location}</span>
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">{item.quantity}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center italic text-slate-500">{item.remark}</td>
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
                <p className="text-slate-400">Chưa có dữ liệu chuyển kho</p>
              </div>
            ) : (
              historyData.map((item) => (
                <div key={item.id} className={`p-4 space-y-3 ${selectedHistory.has(item.id) ? 'bg-blue-50' : 'bg-white'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        checked={selectedHistory.has(item.id)}
                        onChange={() => toggleSelectHistory(item.id)}
                        className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-black text-slate-900">{item.qr_code}</div>
                        <div className="text-[10px] text-slate-500 uppercase flex gap-2">
                          <span>SO: {item.so || '-'}</span>
                          <span>RPRO: {item.rpro || '-'}</span>
                        </div>
                        <div className="text-xs font-bold text-blue-600 uppercase">KH: {item.kh || 'N/A'}</div>
                        <div className="text-xs font-bold text-slate-700">Số lượng: {item.quantity}</div>
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
                  
                  <div className="flex items-center gap-2 py-2 border-y border-slate-50">
                    <div className="flex-1">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Từ vị trí</div>
                      <div className="text-xs font-bold text-slate-600">{item.from_location}</div>
                    </div>
                    <ArrowRightIcon className="w-4 h-4 text-slate-300" />
                    <div className="flex-1 text-right">
                      <div className="text-[10px] font-black text-slate-400 uppercase">Đến vị trí</div>
                      <div className="text-xs font-bold text-blue-700">{item.to_location}</div>
                    </div>
                  </div>

                  {item.remark && (
                    <div className="text-xs text-slate-500 italic bg-slate-50 p-2 rounded-lg">
                      {item.remark}
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 font-bold text-right">
                    {new Date(item.created_at).toLocaleString('vi-VN')}
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

      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`p-4 rounded-2xl shadow-2xl flex items-center gap-3 border-2 ${
              message.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
            }`}>
              {message.type === 'success' ? <CheckCircle2 className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
              <div className="font-black uppercase tracking-tight">{message.text}</div>
              <button onClick={() => setMessage(null)} className="ml-4 p-1 hover:bg-black/5 rounded-lg transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
