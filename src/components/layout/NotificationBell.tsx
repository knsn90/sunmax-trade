import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, Info, X } from 'lucide-react';
import { useNotifications, type Notification } from '@/hooks/useNotifications';

function NotifItem({ notif, onClose }: { notif: Notification; onClose: () => void }) {
  const navigate = useNavigate();

  const colors = {
    danger:  { bg: 'hover:bg-red-50',    dot: 'bg-red-500',    icon: 'text-red-500' },
    warning: { bg: 'hover:bg-amber-50',  dot: 'bg-amber-500',  icon: 'text-amber-500' },
    info:    { bg: 'hover:bg-blue-50',   dot: 'bg-blue-400',   icon: 'text-blue-400' },
  };
  const c = colors[notif.type];

  return (
    <button
      onClick={() => { navigate(notif.href); onClose(); }}
      className={`w-full text-left px-4 py-3 border-b border-border last:border-0 ${c.bg} transition-colors flex items-start gap-3`}
    >
      <div className={`mt-1 flex-shrink-0`}>
        {notif.type === 'info'
          ? <Info className={`h-3.5 w-3.5 ${c.icon}`} />
          : <AlertTriangle className={`h-3.5 w-3.5 ${c.icon}`} />
        }
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-foreground">{notif.title}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{notif.description}</div>
      </div>
      <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${c.dot}`} />
    </button>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, count, dangerCount } = useNotifications();
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4 text-gray-500" />
        {count > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold text-white flex items-center justify-center
            ${dangerCount > 0 ? 'bg-red-500' : 'bg-amber-500'}`}>
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-border shadow-xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-gray-50">
            <div className="text-xs font-bold">
              Notifications
              {count > 0 && (
                <span className="ml-2 bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full font-bold">{count}</span>
              )}
            </div>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                <div className="text-xs text-muted-foreground">No notifications 🎉</div>
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
