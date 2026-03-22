import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';
import { useTheme } from '@/contexts/ThemeContext';

export function AppLayout() {
  const { theme } = useTheme();
  const bg = theme === 'donezo' ? '#f5f7fa' : '#eef2ff';

  return (
    <div className="flex overflow-hidden" style={{ height: '100dvh', background: bg }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main
          className="flex-1 overflow-y-auto p-4 md:p-6 scrollbar-thin"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem + 8px)' }}
        >
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
