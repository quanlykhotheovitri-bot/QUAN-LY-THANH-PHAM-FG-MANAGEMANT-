import { AuthProvider, useAuth } from './contexts/AuthContext';
import MainLayout from './pages/MainLayout';
import Login from './pages/Login';
import { isSupabaseConfigured } from './lib/supabase';
import { AlertTriangle } from 'lucide-react';

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <MainLayout />;
}

export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-xl text-center">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-8 h-8 text-rose-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Cấu hình Supabase chưa hoàn tất</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Ứng dụng chưa được kết nối với cơ sở dữ liệu Supabase. 
            Vui lòng cấu hình các biến môi trường <strong>VITE_SUPABASE_URL</strong> và <strong>VITE_SUPABASE_ANON_KEY</strong> trong cài đặt của Vercel hoặc file .env.
          </p>
          <div className="p-4 bg-slate-50 rounded-xl text-left text-xs font-mono text-slate-500 break-all">
            VITE_SUPABASE_URL=https://your-project.supabase.co<br/>
            VITE_SUPABASE_ANON_KEY=your-anon-key
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
