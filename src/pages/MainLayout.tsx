import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LayoutDashboard, 
  PackagePlus, 
  PackageMinus, 
  PackageSearch, 
  History, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Warehouse,
  ArrowLeftRight,
  ClipboardList
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

type Tab = 'dashboard' | 'inbound' | 'outbound' | 'inventory' | 'transfer' | 'check' | 'history' | 'settings';

export default function MainLayout() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbound', label: 'Nhập kho', icon: PackagePlus },
    { id: 'outbound', label: 'Xuất kho', icon: PackageMinus },
    { id: 'transfer', label: 'Chuyển vị trí', icon: ArrowLeftRight },
    { id: 'check', label: 'Kiểm kê', icon: ClipboardList },
    { id: 'inventory', label: 'Tồn kho', icon: PackageSearch },
    { id: 'history', label: 'Lịch sử', icon: History },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'inbound': return <Inbound />;
      case 'outbound': return <Outbound />;
      case 'inventory': return <Inventory />;
      case 'transfer': return <Transfer />;
      case 'check': return <InventoryCheck />;
      case 'history': return <HistoryLog />;
      case 'settings': return <SettingsPage />;
      default: return <Dashboard />;
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
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
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

            <div className="p-4 border-t border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">FG Management v1.0</p>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-h-screen">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
