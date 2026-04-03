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
  Hash
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, SourceImportLine } from '../types';

export default function Inbound() {
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('');
  const [manualQR, setManualQR] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*');
    if (data) setLocations(data);
  }

  const handleScan = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    // Check for duplicates in current session
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) {
      return;
    }

    // Check if already in warehouse
    const { data: existing } = await supabase
      .from('inventory_balances')
      .select('id')
      .eq('qr_code', parsed.qrCode)
      .limit(1)
      .single();

    if (existing) {
      setMessage({ type: 'error', text: `Mã QR ${parsed.qrCode} đã tồn tại trong kho.` });
      return;
    }

    // Match with source data
    const { data: sourceMatch } = await supabase
      .from('source_import_lines')
      .select('*')
      .or(`rpro.eq.${parsed.rpro},so.eq.${parsed.so}`)
      .limit(1)
      .single();

    const newItem = {
      ...parsed,
      sourceMatch: sourceMatch || null,
      status: sourceMatch ? 'Khớp' : 'Không tìm thấy trong file nguồn',
      locationId: sourceMatch?.default_location || selectedLocation || '',
    };

    setScannedItems(prev => [newItem, ...prev]);
    setIsScanning(false);
  };

  const handleConfirmInbound = async () => {
    if (scannedItems.length === 0) return;
    setLoading(true);
    
    try {
      for (const item of scannedItems) {
        // 1. Record Inbound Transaction
        const { data: inbound, error: inboundError } = await supabase
          .from('inbound_transactions')
          .insert({
            qr_code: item.qrCode,
            so: item.so,
            rpro: item.rpro,
            kh: item.kh,
            quantity: item.quantity,
            box_type: item.boxType,
            location_id: item.locationId || null,
            device_info: navigator.userAgent
          })
          .select()
          .single();

        if (inboundError) throw inboundError;

        // 2. Update Inventory Balance
        const { error: balanceError } = await supabase.rpc('upsert_inventory_balance', {
          p_qr_code: item.qrCode,
          p_so: item.so,
          p_rpro: item.rpro,
          p_kh: item.kh,
          p_quantity: item.quantity,
          p_box_type: item.boxType,
          p_location_id: item.locationId
        });

        if (balanceError) throw balanceError;

        // 3. Record Movement
        await supabase.from('inventory_movements').insert({
          type: 'INBOUND',
          qr_code: item.qrCode,
          to_location_id: item.locationId,
          quantity: item.quantity,
          reference_id: inbound.id,
          remark: 'Nhập kho mới'
        });
      }

      setMessage({ type: 'success', text: `Đã nhập kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
    } catch (error: any) {
      console.error('Inbound error:', error);
      setMessage({ type: 'error', text: error.message || 'Có lỗi xảy ra khi nhập kho.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nhập kho hàng hóa</h1>
          <p className="text-slate-500">Scan QR để thực hiện nhập kho nhanh</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsScanning(!isScanning)}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
              isScanning ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <Scan className="w-5 h-5" />
            {isScanning ? 'Dừng Scan' : 'Bắt đầu Scan'}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isScanning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <QRScanner onScan={handleScan} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Manual Input & Settings */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Nhập thủ công</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Dán mã QR</label>
                <textarea
                  value={manualQR}
                  onChange={(e) => setManualQR(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none h-24"
                  placeholder="Dán dữ liệu QR tại đây..."
                />
                <button
                  onClick={() => {
                    if (manualQR) {
                      handleScan(manualQR);
                      setManualQR('');
                    }
                  }}
                  className="w-full mt-2 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-all"
                >
                  Xử lý mã
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Vị trí mặc định</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Chọn vị trí --</option>
                  {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.full_path}</option>
                  ))}
                </select>
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
                  Xác nhận nhập kho ({scannedItems.length})
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
              <button 
                onClick={() => setScannedItems([])}
                className="text-slate-400 hover:text-rose-500 transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              {scannedItems.length === 0 ? (
                <div className="p-12 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400">Chưa có kiện hàng nào được scan</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thông tin hàng</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Đối chiếu</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Vị trí</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scannedItems.map((item, index) => (
                      <motion.tr 
                        key={item.qrCode}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{item.rpro || item.so}</span>
                              <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{item.qrCode}</span>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-500">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {item.kh}</span>
                              <span className="flex items-center gap-1"><Hash className="w-3 h-3" /> Qty: {item.quantity}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                            item.sourceMatch ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <select
                            value={item.locationId}
                            onChange={(e) => {
                              const newItems = [...scannedItems];
                              newItems[index].locationId = e.target.value;
                              setScannedItems(newItems);
                            }}
                            className="text-sm border border-slate-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Chọn vị trí</option>
                            {locations.map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.full_path}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => setScannedItems(prev => prev.filter((_, i) => i !== index))}
                            className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
