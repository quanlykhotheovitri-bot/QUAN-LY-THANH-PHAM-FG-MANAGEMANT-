import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { parseQRCode } from '../lib/utils';
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
  Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, SourceImportLine } from '../types';
import * as XLSX from 'xlsx';
import { formatDate } from '../lib/utils';

export default function Inbound() {
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [selectedScanned, setSelectedScanned] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [selectedBoxType, setSelectedBoxType] = useState<'Nhựa' | 'Giấy'>('Nhựa');
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [manualQR, setManualQR] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  const exportHistory = (format: 'xlsx' | 'csv') => {
    const data = historyData.map(item => ({
      'QRCODE': item.qr_code,
      'DATE': formatDate(item.created_at),
      'OVN Order No': item.so,
      'RPRO': item.rpro,
      'KHÁCH HÀNG': item.kh,
      'LOẠI THÙNG': item.box_type,
      'SỐ THÙNG ĐƠN HÀNG': item.total_boxes > 0 ? `1 / ${item.total_boxes}` : '1',
      'VỊ TRÍ': item.location_path,
      'NGƯỜI NHẬP': item.user_email
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'InboundHistory');
    XLSX.writeFile(wb, `InboundHistory_${new Date().toISOString().split('T')[0]}.${format}`);
  };

  async function fetchHistory() {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from('inbound_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (data) setHistoryData(data);
    setHistoryLoading(false);
  }

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  const matchedLocation = locations.find(l => l.full_path.trim().toLowerCase() === locationInput.trim().toLowerCase());

  useEffect(() => {
    // Optimization: Only update if items exist and we have a valid location or input
    // But for 5000 items, this is still slow. 
    // Let's only update the state if the number of items is small, 
    // otherwise we'll handle it at confirmation time to avoid UI lag.
    if (scannedItems.length > 0 && scannedItems.length < 500) {
      setScannedItems(prev => prev.map(item => ({
        ...item,
        locationPath: matchedLocation?.full_path || locationInput
      })));
    }
  }, [locationInput, matchedLocation]);

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

    // Fetch matching info from source file if available
    let kh = '';
    let totalBoxes = parsed.totalBoxes;

    const { data: sourceMatch } = await supabase
      .from('source_import_lines')
      .select('kh, quantity')
      .or(`rpro.eq.${parsed.rpro},so.eq.${parsed.so}`)
      .limit(1)
      .single();

    if (sourceMatch) {
      kh = sourceMatch.kh || '';
      // If parsed totalBoxes is 1 (default), try to use source quantity
      if (totalBoxes <= 1 && sourceMatch.quantity > 0) {
        totalBoxes = sourceMatch.quantity;
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

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').filter(line => line.trim() !== '');
    const newItems: any[] = [];
    let currentLocation = matchedLocation?.full_path || locationInput || '';

    // Optimize: Use Sets for O(1) lookup instead of O(N) .some()
    const existingQRs = new Set(scannedItems.map(item => item.qrCode));
    const addedInBatch = new Set();

    // Process each line
    const processLines = async () => {
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        // Check if it's a location (doesn't contain '|')
        if (!trimmedLine.includes('|')) {
          currentLocation = trimmedLine;
          continue;
        }

        // It's a QR code
        const parsed = parseQRCode(trimmedLine);
        if (!existingQRs.has(parsed.qrCode) && !addedInBatch.has(parsed.qrCode)) {
          // Fetch matching info from source file if available
          let kh = '';
          let totalBoxes = parsed.totalBoxes;

          const { data: sourceMatch } = await supabase
            .from('source_import_lines')
            .select('kh, quantity')
            .or(`rpro.eq.${parsed.rpro},so.eq.${parsed.so}`)
            .limit(1)
            .single();

          if (sourceMatch) {
            kh = sourceMatch.kh || '';
            if (totalBoxes <= 1 && sourceMatch.quantity > 0) {
              totalBoxes = sourceMatch.quantity;
            }
          }

          newItems.push({
            ...parsed,
            kh,
            totalBoxes,
            boxType: selectedBoxType,
            locationPath: currentLocation,
          });
          addedInBatch.add(parsed.qrCode);
        }
      }

      if (newItems.length > 0) {
        setScannedItems(prev => [...newItems, ...prev]);
      }
      setManualQR('');
    };

    processLines();
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
    setMessage(null);
    
    try {
      // Use items as they are in the list (copy-paste to DB)
      const itemsToProcess = scannedItems;

      // Call Batch RPC (This handles all 3 steps: Inbound, Balance, Movement)
      const chunkSize = 1000;
      for (let i = 0; i < itemsToProcess.length; i += chunkSize) {
        const chunk = itemsToProcess.slice(i, i + chunkSize);
        const { error: batchError } = await supabase.rpc('process_inbound_v5', {
          p_data: {
            device_info: navigator.userAgent,
            items: chunk
          }
        });

        if (batchError) {
          console.error('Batch process error at chunk:', i, batchError);
          throw new Error(`Lỗi xử lý hàng loạt: ${batchError.message}`);
        }
      }

      setMessage({ type: 'success', text: `Đã nhập kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
      setSelectedScanned(new Set());
      
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
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setActiveTab('scan')}
            className={`text-2xl font-bold transition-all ${activeTab === 'scan' ? 'text-slate-900 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            Nhập kho hàng hóa
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`text-2xl font-bold transition-all ${activeTab === 'history' ? 'text-slate-900 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}
          >
            DATA NHẬP KHO
          </button>
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

            <button
              onClick={() => setIsScanning(!isScanning)}
              className={`flex items-center gap-2 px-6 py-2 rounded-xl font-semibold transition-all ${
                isScanning ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Scan className="w-5 h-5" />
              {isScanning ? 'Dừng Scan' : 'Bắt đầu Scan'}
            </button>
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
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-bold text-slate-900">Cấu hình quét</h2>
                  <div className="flex items-center gap-2">
                    <div className={`flex items-center gap-2 text-xs font-bold px-2 py-1 rounded-lg ${
                      matchedLocation 
                        ? 'text-emerald-600 bg-emerald-50' 
                        : locationInput 
                          ? 'text-blue-600 bg-blue-50' 
                          : 'text-slate-400 bg-slate-50'
                    }`}>
                      <MapPin className="w-3 h-3" />
                      {matchedLocation 
                        ? `Vị trí: ${matchedLocation.full_path}` 
                        : locationInput 
                          ? 'Vị trí mới' 
                          : 'Chưa chọn vị trí'}
                    </div>
                    <button 
                      onClick={fetchLocations}
                      className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Làm mới danh mục vị trí"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  </div>
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
                      className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-all"
                    >
                      Xử lý mã
                    </button>
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
                      LƯU VÀO KHO ({scannedItems.length})
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
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Danh sách chờ nhập</h2>
                  <div className="flex items-center gap-2">
                    {selectedScanned.size > 0 && (
                      <button
                        onClick={deleteSelectedScanned}
                        className="flex items-center gap-2 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Xóa đã chọn ({selectedScanned.size})
                      </button>
                    )}
                    {scannedItems.length > 0 && (
                      <button
                        onClick={handleConfirmInbound}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-all disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        LƯU VÀO KHO
                      </button>
                    )}
                    <button 
                      onClick={() => setScannedItems([])}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                      title="Xóa danh sách"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
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
                            <input 
                              type="checkbox" 
                              checked={selectedScanned.size === scannedItems.length && scannedItems.length > 0}
                              onChange={toggleSelectAllScanned}
                              className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">QRCODE</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SO</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">RPRO</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
                          <th className="px-2 py-3 border border-slate-300"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scannedItems.slice(0, 100).map((item, index) => (
                          <tr 
                            key={item.qrCode}
                            className={`hover:bg-slate-50 transition-colors ${selectedScanned.has(item.qrCode) ? 'bg-blue-50' : ''}`}
                          >
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              <input 
                                type="checkbox" 
                                checked={selectedScanned.has(item.qrCode)}
                                onChange={() => toggleSelectScanned(item.qrCode)}
                                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                              />
                            </td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 font-medium text-slate-700">{item.qrCode}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.rpro}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-medium text-slate-600">{item.kh}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.boxType}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">
                              {item.totalBoxes > 0 ? `1 / ${item.totalBoxes}` : '1'}
                            </td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.locationPath}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{new Date(item.date).toLocaleString('vi-VN')}</td>
                            <td className="px-2 py-3 border border-slate-200 text-center">
                              <button 
                                onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
                                className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {scannedItems.length > 100 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-slate-400 italic bg-slate-50">
                              Đang hiển thị 100/{scannedItems.length} kiện hàng. Toàn bộ dữ liệu sẽ được lưu khi bạn nhấn xác nhận.
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-slate-900">Lịch sử nhập kho (DATA NHẬP KHO)</h2>
              {selectedHistory.size > 0 && (
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
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                Excel
              </button>
              <button 
                onClick={() => exportHistory('csv')}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                CSV
              </button>
              <button 
                onClick={fetchHistory}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
              >
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
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
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">KHÁCH HÀNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">LOẠI THÙNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">SỐ THÙNG ĐƠN HÀNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">VỊ TRÍ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">NGÀY NHẬP</th>
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
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.rpro}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-medium text-slate-600">{item.kh}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.box_type}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">
                        {item.total_boxes > 0 ? `${item.quantity} / ${item.total_boxes}` : item.quantity}
                      </td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.location_path || 'N/A'}</td>
                      <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{new Date(item.created_at).toLocaleString('vi-VN')}</td>
                      <td className="px-2 py-3 border border-slate-200 text-center">
                        <button 
                          onClick={() => deleteHistoryItem(item.id)}
                          className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
