import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Download, Trash2, AlertTriangle, CheckCircle2, Loader2, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface DataArchiverProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DataArchiver({ isOpen, onClose, onSuccess }: DataArchiverProps) {
  const [step, setStep] = useState<'start' | 'packaging' | 'downloaded' | 'deleting' | 'finished'>('start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, number>>({});

  const tables = [
    { id: 'inventory_balances', label: 'Tồn kho hiện tại' },
    { id: 'inbound_transactions', label: 'Lịch sử nhập kho' },
    { id: 'outbound_transactions', label: 'Lịch sử xuất kho' },
    { id: 'inventory_movements', label: 'Lịch sử luân chuyển' },
    { id: 'source_import_lines', label: 'Dữ liệu nguồn' },
    { id: 'plastic_bins', label: 'Quản lý thùng nhựa' },
    { id: 'samples', label: 'Quản lý Sample' }
  ];

  const handlePackageData = async () => {
    setLoading(true);
    setStep('packaging');
    setError(null);
    
    try {
      const workbook = XLSX.utils.book_new();
      const newStats: Record<string, number> = {};

      for (const table of tables) {
        const { data, error: fetchError } = await supabase.from(table.id).select('*');
        if (fetchError) throw fetchError;
        
        if (data && data.length > 0) {
          const worksheet = XLSX.utils.json_to_sheet(data);
          XLSX.utils.book_append_sheet(workbook, worksheet, table.label);
          newStats[table.id] = data.length;
        } else {
          newStats[table.id] = 0;
        }
      }

      setStats(newStats);
      const fileName = `FG_Backup_Full_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
      
      setStep('downloaded');
    } catch (err: any) {
      console.error('Packaging error:', err);
      setError('Lỗi khi đóng gói dữ liệu: ' + err.message);
      setStep('start');
    } finally {
      setLoading(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA TOÀN BỘ DỮ LIỆU TRÊN HỆ THỐNG? Hành động này không thể hoàn tác.')) return;
    
    setLoading(true);
    setStep('deleting');
    setError(null);

    try {
      for (const table of tables) {
        // Delete all rows. In Supabase, we need a filter. 
        // Using .neq('id', '00000000-0000-0000-0000-000000000000') is a common trick for "delete all"
        const { error: deleteError } = await supabase
          .from(table.id)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');
        
        if (deleteError) throw deleteError;
      }

      setStep('finished');
      onSuccess();
    } catch (err: any) {
      console.error('Deletion error:', err);
      setError('Lỗi khi xóa dữ liệu: ' + err.message);
      setStep('downloaded');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-200"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <Package className="text-white w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Đóng gói & Giải phóng</h2>
                <p className="text-xs text-slate-500 font-medium">Bảo trì hệ thống định kỳ</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
              <Trash2 className="w-5 h-5 text-slate-400 rotate-45" />
            </button>
          </div>

          <div className="space-y-6">
            {step === 'start' && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-sm text-amber-800 leading-relaxed font-medium">
                    Dung lượng lưu trữ đã đạt ngưỡng cảnh báo (80%). Vui lòng đóng gói dữ liệu để lưu về máy tính trước khi xóa dữ liệu trên hệ thống.
                  </p>
                </div>
                <button
                  onClick={handlePackageData}
                  disabled={loading}
                  className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                  BẮT ĐẦU ĐÓNG GÓI DỮ LIỆU
                </button>
              </div>
            )}

            {step === 'packaging' && (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto" />
                <p className="text-slate-600 font-bold">Đang thu thập và đóng gói dữ liệu...</p>
                <p className="text-xs text-slate-400 italic">Vui lòng không đóng trình duyệt</p>
              </div>
            )}

            {step === 'downloaded' && (
              <div className="space-y-4">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm text-emerald-800 font-bold">Đã tải dữ liệu thành công!</p>
                    <p className="text-xs text-emerald-700 mt-1">Vui lòng kiểm tra file Excel trong thư mục Downloads của bạn.</p>
                  </div>
                </div>
                
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Thống kê dữ liệu:</h3>
                  <div className="space-y-2">
                    {tables.map(t => (
                      <div key={t.id} className="flex justify-between text-xs">
                        <span className="text-slate-600">{t.label}</span>
                        <span className="font-bold text-slate-900">{stats[t.id] || 0} dòng</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                  <p className="text-xs text-rose-800 leading-relaxed font-bold">
                    BƯỚC CUỐI: Sau khi đã xác nhận file tải về an toàn, hãy nhấn nút dưới đây để xóa sạch dữ liệu trên Supabase và giải phóng bộ nhớ.
                  </p>
                </div>

                <button
                  onClick={handleClearDatabase}
                  disabled={loading}
                  className="w-full py-4 bg-rose-600 text-white rounded-2xl font-bold shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  XÓA DỮ LIỆU TRÊN HỆ THỐNG
                </button>
              </div>
            )}

            {step === 'deleting' && (
              <div className="text-center py-8 space-y-4">
                <Loader2 className="w-12 h-12 text-rose-600 animate-spin mx-auto" />
                <p className="text-slate-600 font-bold">Đang xóa dữ liệu hệ thống...</p>
                <p className="text-xs text-slate-400 italic">Hành động này không thể hoàn tác</p>
              </div>
            )}

            {step === 'finished' && (
              <div className="text-center py-8 space-y-6">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Hoàn tất bảo trì!</h3>
                  <p className="text-slate-500 text-sm mt-2">Hệ thống đã được dọn dẹp sạch sẽ và sẵn sàng cho dữ liệu mới.</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
                >
                  ĐÓNG CỬA SỔ
                </button>
              </div>
            )}

            {error && (
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
