import React, { useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { 
  LayoutDashboard, 
  UtensilsCrossed, 
  Settings as SettingsIcon, 
  LogOut,
  ChevronRight,
  Menu,
  ClipboardList,
  Package,
  LayoutGrid
} from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();

  useEffect(() => {
    const socket = io();
    
    // Initialize the notification sound (Bell ring)
    const bellSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
    bellSound.volume = 0.5;
    
    socket.on('waiter-requested', (data) => {
      bellSound.play().catch(error => console.log("Audio playback failed:", error));
      toast.info(`🔔 Waiter requested at ${data.tableName}`, {
        duration: 8000,
      });
    });

    return () => { socket.disconnect(); };
  }, []);

  const menuItems = [
    { name: 'Dashboard', path: '/admin', icon: LayoutDashboard },
    { name: 'Orders', path: '/admin/orders', icon: ClipboardList },
    { name: 'Table Management', path: '/admin/tables', icon: LayoutGrid },
    { name: 'Menu', path: '/admin/menu', icon: UtensilsCrossed },
    { name: 'Inventory', path: '/admin/inventory', icon: Package },
    { name: 'Settings', path: '/admin/settings', icon: SettingsIcon },
  ];

  return (
    <div className="flex h-screen bg-slate-50/50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">QRMenu</h1>
          <p className="text-xs text-slate-500 font-mono">Restaurant OS</p>
        </div>

        <nav className="flex-1 px-4 space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-sm font-medium",
                location.pathname === item.path 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-900/20" 
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon size={18} />
              {item.name}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-4 py-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
              {user?.name?.[0].toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-semibold text-slate-900 truncate">{user?.name}</p>
              <p className="text-xs text-slate-500 truncate">{user?.role}</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={logout}
          >
            <LogOut size={18} className="mr-3" />
            Logout
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-bottom border-slate-200 flex items-center justify-between px-8">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Pages</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-sm font-medium text-slate-900">
              {menuItems.find(item => 
                 // Exact match for non-index routes, or base path for index
                 item.path === location.pathname || 
                 (item.path === '/admin' && location.pathname === '/admin')
               )?.name || 
               // Fallback for dynamic routes like /menu/:tableId or unmatched
               location.pathname.split('/').pop()?.replace(/-/g, ' ')
                 .split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 
               'Dashboard'}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
