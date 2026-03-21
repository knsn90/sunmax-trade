import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { BottomNav } from './BottomNav';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-5 pb-20 md:pb-5 scrollbar-thin">
          <Outlet />
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
