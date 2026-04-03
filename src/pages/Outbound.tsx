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
  Search,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { WarehouseLocation, InventoryBalance } from '../types';

export default function Outbound() {
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleScan = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) return;

    // 1. Find in Inventory
    const { data: inventory, error } = await supabase
      .from('inventory_balances')
      .select('*, warehouse_locations(*)')
      .eq('qr_code', parsed.qrCode)
      .single();

    // 2. Match with Source Data
    const { data: sourceMatch } = await supabase
      .from('source_import_lines')
      .select('*')
      .or(`rpro.eq.${parsed.rpro},so.eq.${parsed.so}`)
      .limit(1)
      .single();

    let status = 'ok';
    let note = '';

    if (!inventory) {
      status = 'Wrong';
      note = 'Không có trong tồn kho';
    } else if (!sourceMatch) {
      status = 'Wrong';
      note = 'Không khớp file nguồn';
    } else if (parsed.quantity > inventory.quantity) {
      status = 'Wrong';
      note = 'Xuất vượt tồn';
    }

    const newItem = {
      ...parsed,
      inventory: inventory || null,
      sourceMatch: sourceMatch || null,
      status,
      note,
      outQty: parsed.quantity,
    };

    setScannedItems(prev => [newItem, ...prev]);
    setIsScanning(false);
  };

  const handleConfirmOutbound = async () => {
    if (scannedItems.length === 0) return;
    setLoading(true);
    
    try {
      for (const item of scannedItems) {
        if (!item.inventory) continue;

        // 1. Record Outbound Transaction
        const { data: outbound, error: outboundError } = await supabase
          .from('outbound_transactions')
          .insert({
            qr_code: item.qrCode,
            so: item.so,
            rpro: item.rpro,
            kh: item.kh,
            quantity: item.outQty,
            location_id: item.inventory.location_id,
            status: item.status === 'ok' ? 'completed' : 'warning',
            note: item.note,
            device_info: navigator.userAgent
          })
          .select()
          .single();

        if (outboundError) throw outboundError;

        // 2. Update Inventory Balance (Subtract)
        const newQty = item.inventory.quantity - item.outQty;
        if (newQty <= 0) {
          await supabase.from('inventory_balances').delete().eq('id', item.inventory.id);
        } else {
          await supabase.from('inventory_balances').update({ quantity: newQty }).eq('id', item.inventory.id);
        }

        // 3. Record Movement
        await supabase.from('inventory_movements').insert({
          type: 'OUTBOUND',
          qr_code: item.qrCode,
          from_location_id: item.inventory.location_id,
          quantity: item.outQty,
          reference_id: outbound.id,
          remark: `Xuất kho: ${item.note || 'Bình thường'}`
        });
      }

      setMessage({ type: 'success', text: `Đã xuất kho thành công ${scannedItems.length} kiện hàng.` });
      setScannedItems([]);
    } catch (error: any) {
      console.error('Outbound error:', error);
      setMessage({ type: 'error', text: error.message || 'Có lỗi xảy ra khi xuất kho.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Xuất kho hàng hóa</h1>
          <p className="text-slate-500">Scan QR để thực hiện xuất kho và đối chiếu</p>
        </div>
        <button
          onClick={() => setIsScanning(!isScanning)}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
            isScanning ? 'bg-rose-500 text-white' : 'bg-orange-600 text-white hover:bg-orange-700'
          }`}
        >
          <Scan className="w-5 h-5" />
          {isScanning ? 'Dừng Scan' : 'Bắt đầu Scan'}
        </button>
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

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Danh sách xuất hàng</h2>
            <div className="flex gap-4">
              {scannedItems.length > 0 && (
                <button
                  onClick={handleConfirmOutbound}
                  disabled={loading}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save className="w-5 h-5" /> Xác nhận xuất ({scannedItems.length})</>}
                </button>
              )}
              <button onClick={() => setScannedItems([])} className="text-slate-400 hover:text-rose-500"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {scannedItems.length === 0 ? (
              <div className="p-12 text-center">
                <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400">Chưa có kiện hàng nào được scan để xuất</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Thông tin hàng</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Tồn kho / Vị trí</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Số lượng xuất</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scannedItems.map((item, index) => (
                    <tr key={item.qrCode} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{item.rpro || item.so}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.qrCode}</div>
                      </td>
                      <td className="px-6 py-4">
                        {item.inventory ? (
                          <div className="space-y-1">
                            <div className="text-sm font-medium text-slate-700">Tồn: {item.inventory.quantity}</div>
                            <div className="flex items-center gap-1 text-xs text-blue-600 font-bold">
                              <MapPin className="w-3 h-3" /> {item.inventory.warehouse_locations?.full_path}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-rose-500 font-bold">Hết hàng</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <input
                          type="number"
                          value={item.outQty}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            const newItems = [...scannedItems];
                            newItems[index].outQty = val;
                            if (item.inventory && val > item.inventory.quantity) {
                              newItems[index].status = 'Wrong';
                              newItems[index].note = 'Xuất vượt tồn';
                            } else {
                              newItems[index].status = 'ok';
                              newItems[index].note = '';
                            }
                            setScannedItems(newItems);
                          }}
                          className="w-20 px-2 py-1 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                          item.status === 'ok' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500 italic">{item.note}</span>
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
  );
}
