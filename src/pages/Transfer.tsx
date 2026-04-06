import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { 
  Scan, 
  ArrowRight, 
  Save, 
  MapPin, 
  Package,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import QRScanner from '../components/QRScanner';
import { parseQRCode } from '../lib/utils';
import { WarehouseLocation, InventoryBalance } from '../types';

export default function Transfer() {
  const [isScanning, setIsScanning] = useState(false);
  const [item, setItem] = useState<InventoryBalance | null>(null);
  const [locations, setLocations] = useState<WarehouseLocation[]>([]);
  const [newLocationPath, setNewLocationPath] = useState('');
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
    
    const { data, error } = await supabase
      .from('inventory_balances')
      .select('*')
      .eq('qr_code', parsed.qrCode)
      .single();

    if (data) {
      setItem(data);
      setIsScanning(false);
      setMessage(null);
    } else {
      setMessage({ type: 'error', text: 'Không tìm thấy kiện hàng này trong kho.' });
    }
  };

  const handleTransfer = async () => {
    if (!item || !newLocationPath.trim()) return;
    setLoading(true);

    try {
      const finalNewLocation = newLocationPath.trim();

      // 1. Update Inventory Balance Location
      const { error: updateError } = await supabase
        .from('inventory_balances')
        .update({ 
          location_path: finalNewLocation,
          last_updated: new Date().toISOString()
        })
        .eq('id', item.id);

      if (updateError) throw updateError;

      // 2. Record Movement
      await supabase.from('inventory_movements').insert({
        type: 'TRANSFER',
        qr_code: item.qr_code,
        from_location: item.location_path,
        to_location: finalNewLocation,
        quantity: item.quantity,
        remark: 'Chuyển vị trí hàng'
      });

      setMessage({ type: 'success', text: 'Đã chuyển vị trí thành công.' });
      setItem(null);
      setNewLocationPath('');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Chuyển vị trí hàng</h1>
        <p className="text-slate-500">Thay đổi vị trí lưu kho của kiện hàng</p>
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        {!item ? (
          <div className="text-center py-8">
            <button
              onClick={() => setIsScanning(!isScanning)}
              className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 flex items-center gap-2 mx-auto transition-all"
            >
              <Scan className="w-6 h-6" />
              {isScanning ? 'Đang chờ scan...' : 'Scan mã QR cần chuyển'}
            </button>
            {isScanning && (
              <div className="mt-6">
                <QRScanner onScan={handleScan} />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-4">
              <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center border border-slate-200">
                <Package className="text-blue-600 w-6 h-6" />
              </div>
              <div className="flex-1">
                <div className="font-bold text-slate-900">{item.rpro || item.so}</div>
                <div className="text-xs text-slate-500 font-mono">{item.qr_code}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-slate-900">SL: {item.quantity}</div>
                <div className="text-[10px] text-slate-400 uppercase font-bold">{item.box_type}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 items-center gap-4">
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
                <p className="text-[10px] text-blue-600 font-bold uppercase mb-1">Vị trí cũ</p>
                <div className="flex items-center justify-center gap-1 font-bold text-blue-700">
                  <MapPin className="w-4 h-4" />
                  {item.location_path}
                </div>
              </div>
              
              <div className="flex justify-center">
                <ArrowRight className="text-slate-300 w-8 h-8" />
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-slate-500 font-bold uppercase text-center">Vị trí mới</p>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <input
                    type="text"
                    value={newLocationPath}
                    onChange={(e) => setNewLocationPath(e.target.value)}
                    placeholder="Nhập vị trí mới..."
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-bold text-center"
                    list="location-suggestions"
                  />
                  <datalist id="location-suggestions">
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.full_path} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setItem(null)}
                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-all"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleTransfer}
                disabled={!newLocationPath.trim() || loading}
                className="flex-[2] py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-100 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><Save className="w-5 h-5" /> Xác nhận chuyển</>}
              </button>
            </div>
          </div>
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
    </div>
  );
}
