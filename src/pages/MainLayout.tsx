import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  PackagePlus, 
  PackageMinus, 
  PackageSearch, 
  History as HistoryIcon, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  Box,
  FlaskConical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Dashboard from './Dashboard';
import Inbound from './Inbound';
import Outbound from './Outbound';
import Inventory from './Inventory';
import HistoryLog from './HistoryLog';
import SettingsPage from './SettingsPage';
import Transfer from './Transfer';
import InventoryCheck from './InventoryCheck';
import PlasticBins from './PlasticBins';
import Samples from './Samples';
import StorageUsage from '../components/StorageUsage';

type Tab = 'dashboard' | 'inbound' | 'outbound' | 'inventory' | 'transfer' | 'check' | 'history' | 'settings' | 'plastic-bins' | 'samples';

export default function MainLayout() {
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(user?.role === 'admin' || user?.role === 'viewer' ? 'dashboard' : 'inbound');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'viewer'] },
    { id: 'inbound', label: 'Nhập kho', icon: PackagePlus, roles: ['admin', 'user', 'viewer'] },
    { id: 'outbound', label: 'Xuất kho', icon: PackageMinus, roles: ['admin', 'user', 'viewer'] },
    { id: 'transfer', label: 'Chuyển vị trí', icon: ArrowLeftRight, roles: ['admin', 'viewer'] },
    { id: 'check', label: 'Kiểm kê', icon: ClipboardList, roles: ['admin', 'viewer'] },
    { id: 'inventory', label: 'Tồn kho', icon: PackageSearch, roles: ['admin', 'viewer'] },
    { id: 'plastic-bins', label: 'Thùng nhựa', icon: Box, roles: ['admin', 'user', 'viewer'] },
    { id: 'samples', label: 'Sample', icon: FlaskConical, roles: ['admin', 'user', 'viewer'] },
    { id: 'history', label: 'Lịch sử', icon: HistoryIcon, roles: ['admin', 'viewer'] },
    { id: 'settings', label: 'Cài đặt', icon: Settings, roles: ['admin', 'viewer'] },
  ];

  const menuItems = allMenuItems.filter(item => item.roles.includes(user?.role || ''));

  const renderContent = () => {
    const currentItem = allMenuItems.find(item => item.id === activeTab);
    const hasAccess = currentItem?.roles.includes(user?.role || '');

    if (!hasAccess) {
      return user?.role === 'admin' ? <Dashboard /> : <Inbound />;
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'inbound': return <Inbound />;
      case 'outbound': return <Outbound />;
      case 'inventory': return <Inventory />;
      case 'transfer': return <Transfer />;
      case 'check': return <InventoryCheck />;
      case 'plastic-bins': return <PlasticBins />;
      case 'samples': return <Samples />;
      case 'history': return <HistoryLog />;
      case 'settings': return <SettingsPage />;
      default: return user?.role === 'admin' ? <Dashboard /> : <Inbound />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Warehouse className="text-white w-5 h-5" />
          </div>
          <span className="font-bold text-slate-900">FG Management</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200">
            <span className="text-[10px] font-bold text-slate-600 uppercase">{user?.username.slice(0, 2)}</span>
          </div>
          <button 
            onClick={signOut}
            className="p-2 text-slate-400 hover:text-rose-600"
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(isSidebarOpen || window.innerWidth >= 768) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={`fixed md:relative inset-y-0 left-0 w-64 bg-white border-r border-slate-200 z-40 flex flex-col transition-all ${isSidebarOpen ? 'block' : 'hidden md:flex'}`}
          >
            <div className="p-6 hidden md:flex items-center gap-3 border-b border-slate-100">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-100">
                <Warehouse className="text-white w-6 h-6" />
              </div>
              <div>
                <h1 className="font-bold text-slate-900 leading-tight">FG Management</h1>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Warehouse Solution</p>
              </div>
            </div>

            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as Tab);
                    setIsSidebarOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600' : 'text-slate-400'}`} />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="mt-auto border-t border-slate-200 bg-slate-50/50">
              <div className="py-4">
                <StorageUsage />
              </div>
              
              <div className="border-t border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-slate-900 rounded-full flex items-center justify-center text-white font-bold text-sm border-2 border-white shadow-sm shrink-0">
                      {user?.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-bold text-slate-900 truncate">
                        {user?.username === 'admin' ? 'Admin User' : user?.username}
                      </span>
                      <span className="text-[10px] text-slate-500 truncate">
                        {user?.email || 'quanlykhotheovitri@gmail.com'}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={signOut}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Đăng xuất"
                  >
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Desktop Header */}
        <header className="hidden md:flex bg-white border-b border-slate-200 h-16 items-center justify-end px-8 sticky top-0 z-30">
          <div className="flex items-center gap-4 bg-white p-2 pr-5 rounded-xl border-2 border-blue-500 shadow-lg hover:shadow-xl transition-all">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white text-sm font-black shadow-md">
              {user?.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-black text-slate-900 leading-none">{user?.username}</span>
              <span className="text-[10px] text-blue-600 uppercase font-black tracking-wider mt-1">
                {user?.role === 'admin' ? 'Quản trị viên' : user?.role === 'viewer' ? 'Người xem' : 'Nhân viên'}
              </span>
            </div>
            <div className="w-px h-6 bg-slate-200 mx-2" />
            <button 
              onClick={signOut}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
              title="Đăng xuất"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-[1800px] mx-auto">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
}
