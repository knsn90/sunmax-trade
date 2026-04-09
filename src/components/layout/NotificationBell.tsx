import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Info, X } from 'lucide-react';
import { useNotifications, type Notification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

const TYPE_META = {
  danger:  { dot: 'bg-red-400',   icon: 'text-red-500',   bg: 'hover:bg-red-50/60',   label: 'bg-red-50 text-red-600 border-red-100' },
  warning: { dot: 'bg-amber-400', icon: 'text-amber-500', bg: 'hover:bg-amber-50/60', label: 'bg-amber-50 text-amber-700 border-amber-100' },
  info:    { dot: 'bg-blue-400',  icon: 'text-blue-500',  bg: 'hover:bg-blue-50/60',  label: 'bg-blue-50 text-blue-600 border-blue-100' },
};

function NotifItem({ notif, onClose }: { notif: Notification; onClose: () => void }) {
  const navigate = useNavigate();
  const m = TYPE_META[notif.type];

  return (
    <button
      onClick={() => { navigate(notif.href); onClose(); }}
      className={cn('w-full text-left px-5 py-3.5 border-b border-gray-50 last:border-0 transition-colors flex items-start gap-3', m.bg)}
    >
      <div className="mt-0.5 shrink-0">
        {notif.type === 'info'
          ? <Info className={cn('h-3.5 w-3.5', m.icon)} />
          : <AlertTriangle className={cn('h-3.5 w-3.5', m.icon)} />
        }
      </div>
      <div className="flex-1 min-w-0 text-left">
        <div className="text-[12px] font-semibold text-gray-900 leading-snug">{notif.title}</div>
        <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{notif.description}</div>
      </div>
      <span className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', m.dot)} />
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, count, dangerCount } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4 text-gray-500" />
        {count > 0 && (
          <span className={cn(
            'absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center',
            dangerCount > 0 ? 'bg-red-500' : 'bg-amber-500',
          )}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] bg-white rounded-2xl border border-gray-100 shadow-xl z-50 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Bildirimler</span>
              {count > 0 && (
                <span className={cn(
                  'text-[9px] font-extrabold px-1.5 py-0.5 rounded-full border',
                  dangerCount > 0
                    ? 'bg-red-50 text-red-600 border-red-100'
                    : 'bg-amber-50 text-amber-700 border-amber-100',
                )}>
                  {count}
                </span>
              )}
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* List */}
          <div className="max-h-[400px] overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Bell className="h-7 w-7 mb-2 opacity-20" />
                <p className="text-[12px] font-medium text-gray-500">Bildirim yok</p>
                <p className="text-[11px] mt-0.5 text-gray-400">Her şey yolunda 🎉</p>
              </div>
            ) : (
              notifications.map(n => (
                <NotifItem key={n.id} notif={n} onClose={() => setOpen(false)} />
              ))
            )}
          </div>

        </div>
      )}
    </div>
  );
}
