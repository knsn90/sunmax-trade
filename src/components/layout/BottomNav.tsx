import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Home, BarChart3, FileText, LayoutDashboard, MoreHorizontal,
  Receipt, Users, Box, Settings, X, Activity, Tag, TrendingUp,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const mainTabs = [
  { to: '/dashboard',  label: 'Ana Sayfa', icon: Home },
  { to: '/pipeline',   label: 'Pipeline',  icon: BarChart3 },
  { to: '/files',      label: 'Dosyalar',  icon: FileText },
  { to: '/accounting', label: 'Muhasebe',  icon: LayoutDashboard },
];

const moreItems = [
  { to: '/documents',   label: 'Belgeler',      icon: Receipt },
  { to: '/fin-reports', label: 'Mali Raporlar', icon: TrendingUp },
  { to: '/contacts',    label: 'Kişiler',       icon: Users },
  { to: '/products',    label: 'Ürünler',       icon: Box },
  { to: '/price-list',  label: 'Fiyat Listesi', icon: Tag },
  { to: '/settings',    label: 'Ayarlar',       icon: Settings },
];

const adminItems = [
  { to: '/activity', label: 'Aktivite', icon: Activity },
];

export function BottomNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { accent } = useTheme();
  const { profile } = useAuth();

  const isAdmin  = profile?.role === 'admin';
  const drawerItems = isAdmin ? [...moreItems, ...adminItems] : moreItems;

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const isMoreActive = drawerItems.some(item =>
    location.pathname === item.to || location.pathname.startsWith(item.to + '/')
  );

  function handleMoreItemClick(to: string) {
    setDrawerOpen(false);
    navigate(to);
  }

  return (
    <>
      {/* Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── More Drawer ───────────────────────────────────────────────────── */}
      <div
        className={cn(
          'fixed left-4 right-4 z-50 md:hidden rounded-3xl overflow-hidden transition-all duration-300',
          drawerOpen ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-4 pointer-events-none',
        )}
        style={{
          bottom: 'calc(76px + env(safe-area-inset-bottom))',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 -4px 32px rgba(183,0,17,0.10), 0 8px 32px rgba(0,0,0,0.12)',
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-1 h-5 rounded-full" style={{ background: 'linear-gradient(135deg, #b70011, #dc2626)' }} />
            <span className="text-[13px] font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: 'Manrope, sans-serif' }}>
              Diğer Menüler
            </span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 active:bg-gray-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Grid */}
        <div className="px-4 pb-5 grid grid-cols-3 gap-2">
          {drawerItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to || location.pathname.startsWith(item.to + '/');
            return (
              <button
                key={item.to}
                onClick={() => handleMoreItemClick(item.to)}
                className={cn(
                  'flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-all active:scale-95',
                  isActive ? 'text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100',
                )}
                style={isActive ? { background: 'linear-gradient(135deg, #b70011 0%, #dc2626 100%)' } : {}}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[11px] font-semibold text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Floating Pill Nav ─────────────────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden flex justify-center pointer-events-none"
        style={{ paddingBottom: 'calc(14px + env(safe-area-inset-bottom))' }}
      >
        <div
          className="flex items-center pointer-events-auto"
          style={{
            background: 'rgba(183, 0, 17, 0.93)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            boxShadow: '0 8px 32px rgba(183,0,17,0.30), 0 2px 8px rgba(0,0,0,0.10)',
            borderRadius: 9999,
            padding: '6px',
            width: 'calc(100% - 32px)',
            maxWidth: 440,
            gap: 2,
          }}
        >
          {/* Main tabs */}
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="flex-1"
              >
                {({ isActive }) => (
                  <div
                    className={cn(
                      'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-full transition-all active:scale-95',
                      isActive ? 'bg-white' : '',
                    )}
                  >
                    <Icon
                      className="h-[18px] w-[18px]"
                      style={{ color: isActive ? accent : 'rgba(255,255,255,0.85)' }}
                    />
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide leading-none whitespace-nowrap"
                      style={{ color: isActive ? accent : 'rgba(255,255,255,0.70)' }}
                    >{tab.label}</span>
                  </div>
                )}
              </NavLink>
            );
          })}

          {/* More button */}
          <button
            onClick={() => setDrawerOpen(v => !v)}
            className="flex-1"
          >
            <div
              className={cn(
                'flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-full transition-all active:scale-95',
                (isMoreActive || drawerOpen) ? 'bg-white' : '',
              )}
            >
              <MoreHorizontal
                className="h-[18px] w-[18px]"
                style={{ color: (isMoreActive || drawerOpen) ? accent : 'rgba(255,255,255,0.85)' }}
              />
              <span
                className="text-[9px] font-bold uppercase tracking-wide leading-none"
                style={{ color: (isMoreActive || drawerOpen) ? accent : 'rgba(255,255,255,0.70)' }}
              >Daha</span>
            </div>
          </button>
        </div>
      </nav>
    </>
  );
}
