import { useState, useEffect, ChangeEvent } from 'react';
import { supabase } from '../lib/supabase';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Trash2,
  MapPin,
  Plus,
  Save,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';

export default function SettingsPage() {
  const [importLoading, setImportLoading] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [newLoc, setNewLoc] = useState({ zone: '', shelf: '', level: '', bin: '' });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchLocations();
  }, []);

  async function fetchLocations() {
    const { data } = await supabase.from('warehouse_locations').select('*').order('full_path');
    if (data) setLocations(data);
  }

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        // 1. Create Import Record
        const { data: importFile, error: fileError } = await supabase
          .from('source_import_files')
          .insert({ file_name: file.name })
          .select()
          .single();

        if (fileError) throw fileError;

        // 2. Insert Lines
        const lines = data.map((row: any) => ({
          import_file_id: importFile.id,
          so: String(row.SO || row.so || ''),
          rpro: String(row.RPRO || row.rpro || ''),
          kh: String(row.KH || row.kh || ''),
          quantity: parseInt(row.Quantity || row.quantity || row['Số lượng'] || 0),
          box_type: String(row.BoxType || row.box_type || row['Loại thùng'] || ''),
          default_location: String(row.Location || row.location || row['Vị trí'] || '')
        }));

        const { error: linesError } = await supabase.from('source_import_lines').insert(lines);
        if (linesError) throw linesError;

        setMessage({ type: 'success', text: `Đã import thành công ${lines.length} dòng dữ liệu.` });
      } catch (error: any) {
        setMessage({ type: 'error', text: error.message });
      } finally {
        setImportLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleAddLocation = async () => {
    const fullPath = `${newLoc.zone}-${newLoc.shelf}-${newLoc.level}-${newLoc.bin}`;
    const { error } = await supabase.from('warehouse_locations').insert({
      ...newLoc,
      full_path: fullPath
    });

    if (error) {
      setMessage({ type: 'error', text: 'Vị trí đã tồn tại hoặc dữ liệu không hợp lệ.' });
    } else {
      setMessage({ type: 'success', text: 'Đã thêm vị trí mới.' });
      setNewLoc({ zone: '', shelf: '', level: '', bin: '' });
      fetchLocations();
    }
  };

  const handleDeleteLocation = async (id: string) => {
    const { error } = await supabase.from('warehouse_locations').delete().eq('id', id);
    if (error) {
      setMessage({ type: 'error', text: 'Không thể xóa vị trí đang có hàng.' });
    } else {
      fetchLocations();
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Cấu hình hệ thống</h1>
        <p className="text-slate-500">Quản lý dữ liệu nguồn và vị trí kho</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Import Source Data */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">Import file nguồn</h2>
          </div>
          
          <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center mx-auto">
              <Upload className="text-emerald-600 w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">Click để tải lên file Excel (.xlsx, .csv)</p>
              <p className="text-xs text-slate-400 mt-1">Hỗ trợ các cột: SO, RPRO, KH, Quantity, BoxType, Location</p>
            </div>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={importLoading}
            />
            <label
              htmlFor="file-upload"
              className={`inline-block px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold cursor-pointer hover:bg-emerald-700 transition-all ${importLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {importLoading ? 'Đang xử lý...' : 'Chọn File'}
            </label>
          </div>
        </div>

        {/* Location Management */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <MapPin className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">Quản lý vị trí kho</h2>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <input
              placeholder="Zone"
              value={newLoc.zone}
              onChange={e => setNewLoc({...newLoc, zone: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Kệ"
              value={newLoc.shelf}
              onChange={e => setNewLoc({...newLoc, shelf: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Tầng"
              value={newLoc.level}
              onChange={e => setNewLoc({...newLoc, level: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              placeholder="Ô"
              value={newLoc.bin}
              onChange={e => setNewLoc({...newLoc, bin: e.target.value})}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={handleAddLocation}
            className="w-full py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus className="w-4 h-4" /> Thêm vị trí
          </button>

          <div className="mt-6 max-h-60 overflow-y-auto border border-slate-100 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">Vị trí</th>
                  <th className="px-4 py-2 text-xs font-bold text-slate-500 uppercase text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.map(loc => (
                  <tr key={loc.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 text-sm font-medium text-slate-700">{loc.full_path}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => handleDeleteLocation(loc.id)} className="text-slate-300 hover:text-rose-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm font-medium">{message.text}</p>
        </div>
      )}
    </div>
  );
}
