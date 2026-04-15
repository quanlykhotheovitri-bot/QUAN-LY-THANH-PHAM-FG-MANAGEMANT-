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
  MapPin,
  ArrowRight,
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
  const [manualQR, setManualQR] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const [activeTab, setActiveTab] = useState<'scan' | 'history'>('scan');
  const [historyData, setHistoryData] = useState<any[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<Set<string>>(new Set());
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const historyPageSize = 50;

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

    const { data, count, error } = await supabase
      .from('inventory_movements')
      .select('*', { count: 'exact' })
      .eq('type', 'TRANSFER')
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

  const handleProcessManual = () => {
    if (!manualQR.trim()) return;
    
    const lines = manualQR.split('\n').filter(line => line.trim() !== '');
    let currentLocation = matchedLocation?.full_path || locationInput || '';

    const processLines = async () => {
      setLoading(true);
      setIsLoading(true);
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (!trimmedLine.includes('|')) {
          currentLocation = trimmedLine;
          // If we find a location, we can also update the main location input if it's empty
          if (!locationInput) setLocationInput(currentLocation);
          continue;
        }
        
        await processSingleQR(trimmedLine, currentLocation);
        
        // Small delay to allow UI to breathe if there are many items
        if (lines.length > 10) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      setManualQR('');
      setLoading(false);
      setIsLoading(false);
    };

    processLines();
  };

  const confirmTransfer = async () => {
    if (scannedItems.length === 0) return;
    
    const itemsToProcess = scannedItems.filter(item => item.toLocation && item.status === 'OK');
    if (itemsToProcess.length === 0) {
      setMessage({ type: 'error', text: 'Không có kiện hàng hợp lệ để chuyển vị trí.' });
      return;
    }

    const wrongItems = scannedItems.filter(item => item.status === 'Wrong');
    if (wrongItems.length > 0) {
      if (!window.confirm(`Có ${wrongItems.length} kiện hàng không hợp lệ sẽ bị bỏ qua. Bạn có muốn tiếp tục?`)) {
        return;
      }
    }

    setLoading(true);
    setIsLoading(true);
    try {
      const chunkSize = 100;
      for (let i = 0; i < itemsToProcess.length; i += chunkSize) {
        const chunk = itemsToProcess.slice(i, i + chunkSize);
        
        const updatePromises = chunk.map(item => 
          supabase
            .from('inventory_balances')
            .update({ 
              location_path: item.toLocation,
              last_updated: new Date().toISOString()
            })
            .eq('id', item.id)
        );
        
        const movementData = chunk.map(item => ({
          type: 'TRANSFER',
          qr_code: item.qrCode,
          from_location: item.fromLocation,
          to_location: item.toLocation,
          quantity: item.quantity,
          remark: `Chuyển vị trí hàng (Batch) - ${authUser?.email || 'System'}`
        }));

        const [updateResults, movementResult] = await Promise.all([
          Promise.all(updatePromises),
          supabase.from('inventory_movements').insert(movementData)
        ]);

        const firstError = updateResults.find(r => r.error)?.error || movementResult.error;
        if (firstError) throw firstError;
      }

      setMessage({ type: 'success', text: `Đã chuyển vị trí thành công ${itemsToProcess.length} kiện hàng.` });
      setScannedItems([]);
      setSelectedScanned(new Set());
      clearAppCache();
    } catch (error: any) {
      setMessage({ type: 'error', text: 'Lỗi khi chuyển vị trí: ' + error.message });
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
                          <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center whitespace-nowrap">TRẠNG THÁI</th>
                          <th className="px-2 py-3 border border-slate-300"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {scannedItems.map((item, index) => (
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
                              <span className={`px-2 py-1 rounded font-bold ${item.toLocation ? 'bg-blue-50 text-blue-700' : 'bg-rose-50 text-rose-400 italic'}`}>
                                {item.toLocation || 'Chưa có'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.so}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center">{item.rpro}</td>
                            <td className="px-4 py-3 text-[11px] border border-slate-200 text-center font-bold">{item.quantity}</td>
                            <td className={`px-4 py-3 text-[11px] border border-slate-200 text-center font-bold ${item.status === 'OK' ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {item.status === 'OK' ? 'Hợp lệ' : 'Lỗi'}
                            </td>
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
          <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-bold text-blue-900 uppercase">Lịch sử chuyển vị trí</h2>
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
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg flex items-center gap-2 text-xs font-bold hover:bg-slate-50 transition-all"
              >
                <Download className="w-3.5 h-3.5 text-blue-600" />
                Excel
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
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">QRCODE</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">VỊ TRÍ CŨ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">VỊ TRÍ MỚI</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">SỐ LƯỢNG</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">GHI CHÚ</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center">THỜI GIAN</th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider border border-slate-300 text-center"></th>
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
