import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Scan, 
  CheckCircle2, 
  AlertCircle, 
  Save, 
  Trash2,
  Package,
  MapPin,
  ClipboardList,
  RefreshCw
} from 'lucide-react';
import QRScanner from '../components/QRScanner';
import { parseQRCode, formatDate } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

export default function InventoryCheck() {
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleScan = async (qrData: string) => {
    const parsed = parseQRCode(qrData);
    
    if (scannedItems.some(item => item.qrCode === parsed.qrCode)) return;

    // Find current inventory
    const { data: inventory } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('qr_code', parsed.qrCode)
      .single();

    const newItem = {
      ...parsed,
      inventory: inventory || null,
      actualQty: parsed.quantity,
      diff: inventory ? parsed.quantity - inventory.quantity : parsed.quantity,
      status: inventory ? (parsed.quantity === inventory.quantity ? 'Khớp' : 'Lệch') : 'Mới'
    };

    setScannedItems(prev => [newItem, ...prev]);
    setIsScanning(false);
  };

  const handleSaveCheck = async () => {
    if (scannedItems.length === 0) return;
    setLoading(true);

    try {
      for (const item of scannedItems) {
        // Record movement as adjustment
        await supabase.from('inventory_movements').insert({
          type: 'ADJUSTMENT',
          qr_code: item.qrCode,
          to_location: item.inventory?.location_path,
          quantity: item.actualQty,
          remark: `Kiểm kê kho: ${item.status}`
        });

        // Update balance if needed
        if (item.status !== 'Khớp') {
          if (item.inventory) {
            // Update existing
            if (item.actualQty === 0) {
              await supabase.from('inventory_balances').delete().eq('id', item.inventory.id);
            } else {
              await supabase.from('inventory_balances').update({ 
                quantity: item.actualQty,
                last_updated: new Date().toISOString()
              }).eq('id', item.inventory.id);
            }
          } else if (item.actualQty > 0) {
            // Create new (if not found in system but found in reality)
            // Note: We don't have a location here, so we might need to ask or use a default
            // For now, let's just log it or handle if we have location info
          }
        }
      }
      setMessage({ type: 'success', text: 'Đã lưu kết quả kiểm kê.' });
      setScannedItems([]);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Kiểm kê kho thực tế</h1>
          <p className="text-slate-500">Scan QR để đối chiếu tồn kho hệ thống và thực tế</p>
        </div>
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

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Kết quả kiểm kê ({scannedItems.length})</h2>
          <div className="flex gap-2">
            {scannedItems.length > 0 && (
              <button
                onClick={handleSaveCheck}
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
              >
                <Save className="w-4 h-4" /> Lưu kết quả
              </button>
            )}
            <button onClick={() => setScannedItems([])} className="p-2 text-slate-400 hover:text-rose-500"><Trash2 className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {scannedItems.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-400">Chưa có kiện hàng nào được kiểm kê</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Hàng hóa / Vị trí</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Hệ thống</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Thực tế</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Chênh lệch</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scannedItems.map((item, index) => (
                  <tr key={item.qrCode} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900">{item.rpro || item.so}</div>
                      <div className="flex items-center gap-1 text-[10px] text-blue-600 font-bold">
                        <MapPin className="w-3 h-3" /> {item.inventory?.location_path || 'N/A'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center font-medium text-slate-600">
                      {item.inventory?.quantity || 0}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        value={item.actualQty}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          const newItems = [...scannedItems];
                          newItems[index].actualQty = val;
                          newItems[index].diff = val - (item.inventory?.quantity || 0);
                          newItems[index].status = val === (item.inventory?.quantity || 0) ? 'Khớp' : 'Lệch';
                          setScannedItems(newItems);
                        }}
                        className="w-16 px-2 py-1 border border-slate-200 rounded text-center font-bold"
                      />
                    </td>
                    <td className={`px-6 py-4 text-center font-bold ${item.diff > 0 ? 'text-emerald-600' : item.diff < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                      {item.diff > 0 ? `+${item.diff}` : item.diff}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase ${
                        item.status === 'Khớp' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
