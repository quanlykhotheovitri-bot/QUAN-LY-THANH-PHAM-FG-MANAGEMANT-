import { FlaskConical } from 'lucide-react';

export default function Samples() {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border-2 border-purple-500 shadow-lg">
        <div className="flex items-center gap-3 bg-purple-600 p-3 rounded-xl shadow-md w-fit">
          <FlaskConical className="w-6 h-6 text-white" />
          <h1 className="text-2xl font-black text-white tracking-tight leading-none">Quản lý Sample</h1>
        </div>
        <p className="text-slate-500 mt-4">Trang quản lý các mặt hàng mẫu (Sample) trong kho.</p>
      </div>
      
      <div className="bg-white p-20 rounded-2xl border-2 border-slate-200 shadow-xl text-center">
        <FlaskConical className="w-16 h-16 text-slate-200 mx-auto mb-4" />
        <p className="text-slate-400 font-medium">Tính năng đang được phát triển</p>
      </div>
    </div>
  );
}
