import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/services/supabase';
import {
  Info, X, UserCircle, Pencil, Plus, Trash2,
  ShoppingCart, Truck, CheckCircle2, XCircle, Package,
} from 'lucide-react';
import type { TradeFile } from '@/types/database';
import { cn } from '@/lib/utils';

function fTs(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh   = String(d.getHours()).padStart(2, '0');
  const min  = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy} ${hh}:${min}`;
}

interface AuditEntry {
  id: string;
  action: 'create' | 'update' | 'delete';
  created_at: string;
  user_id: string | null;
  new_values: Record<string, unknown> | null;
}

interface Props {
  file: TradeFile;
}

// ── Durum geçişi meta ──────────────────────────────────────────────────────
const STATUS_TRANSITION: Record<string, {
  label: string;
  icon: React.ElementType;
  dot: string;
  text: string;
}> = {
  sale:      { label: 'Satışa Çevirdi',     icon: ShoppingCart,  dot: 'bg-blue-400',   text: 'text-blue-700'   },
  delivery:  { label: 'Teslimata Çevirdi',  icon: Truck,         dot: 'bg-violet-400', text: 'text-violet-700' },
  completed: { label: 'Tamamladı',          icon: CheckCircle2,  dot: 'bg-green-400',  text: 'text-green-700'  },
  cancelled: { label: 'İptal Etti',         icon: XCircle,       dot: 'bg-gray-300',   text: 'text-gray-500'   },
  request:   { label: 'Talebe Döndürdü',    icon: Package,       dot: 'bg-amber-400',  text: 'text-amber-700'  },
};

// Hangi alanlar değişmişse okunabilir etiket üret
function resolveLabel(entry: AuditEntry): {
  label: string;
  icon: React.ElementType;
  dot: string;
  text: string;
} {
  if (entry.action === 'create') {
    return { label: 'Oluşturdu', icon: Plus,   dot: 'bg-green-400', text: 'text-green-700' };
  }
  if (entry.action === 'delete') {
    return { label: 'Sildi',     icon: Trash2, dot: 'bg-red-400',   text: 'text-red-700'   };
  }

  // update — new_values'a bak
  const nv = entry.new_values ?? {};

  // Durum değişimi en öncelikli
  if (typeof nv.status === 'string' && STATUS_TRANSITION[nv.status]) {
    return STATUS_TRANSITION[nv.status];
  }

  // Teslimat bilgileri (delivered_admt, arrival_date, bl_number …)
  const deliveryKeys = ['delivered_admt', 'arrival_date', 'bl_number', 'gross_weight_kg', 'packages'];
  if (deliveryKeys.some(k => k in nv)) {
    return { label: 'Teslimat Güncelledi', icon: Truck,   dot: 'bg-violet-400', text: 'text-violet-700' };
  }

  // Genel düzenleme
  return { label: 'Düzenledi', icon: Pencil, dot: 'bg-blue-400', text: 'text-blue-700' };
}

const POPOVER_WIDTH = 288; // w-72

export function FileActivityPopover({ file }: Props) {
  const [open, setOpen]       = useState(false);
  const [pos, setPos]         = useState({ top: 0, left: 0 });
  const [logs, setLogs]       = useState<AuditEntry[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const btnRef                = useRef<HTMLButtonElement>(null);
  const popoverRef            = useRef<HTMLDivElement>(null);

  // ── Compute popover position from button rect ──────────────────────────────
  const openPopover = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow > 360
      ? rect.bottom + window.scrollY + 6
      : rect.top + window.scrollY - 6;
    const left = Math.min(
      rect.right + window.scrollX - POPOVER_WIDTH,
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    setPos({ top, left: Math.max(left, 8) });
    setOpen(true);
  }, []);

  // ── Fetch audit logs + resolve user names ──────────────────────────────────
  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setLogs([]);
    setUserMap({});

    (async () => {
      const { data: logData } = await supabase
        .from('audit_logs')
        .select('id, action, created_at, user_id, new_values')
        .eq('table_name', 'trade_files')
        .eq('record_id', file.id)
        .order('created_at', { ascending: false })
        .limit(20);

      const entries: AuditEntry[] = (logData ?? []) as AuditEntry[];
      setLogs(entries);

      const ids = [...new Set(entries.map(e => e.user_id).filter(Boolean))] as string[];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', ids);
        const map: Record<string, string> = {};
        (profiles ?? []).forEach((p: { id: string; full_name: string }) => {
          map[p.id] = p.full_name;
        });
        setUserMap(map);
      }

      setLoading(false);
    })();
  }, [open, file.id]);

  // ── Close on outside click or scroll ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const userName = (userId: string | null) => {
    if (!userId) return 'Sistem';
    return userMap[userId] ?? '—';
  };

  const creatorName = (() => {
    if (file.creator?.full_name) return file.creator.full_name;
    const createLog = logs.find(l => l.action === 'create');
    if (createLog?.user_id) return userMap[createLog.user_id] ?? '—';
    return '—';
  })();

  const popover = open && createPortal(
    <div
      ref={popoverRef}
      style={{ position: 'absolute', top: pos.top, left: pos.left, width: POPOVER_WIDTH, zIndex: 9999 }}
      className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between bg-gray-50/60">
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
          Aktivite
        </span>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* File meta */}
      <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/30">
        <p className="text-[10px] font-mono text-gray-400">{file.file_no}</p>
        <p className="text-[12px] font-semibold text-gray-800 truncate">
          {file.customer?.name ?? '—'}
        </p>
      </div>

      {/* Creator row */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
        <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center shrink-0">
          <UserCircle className="h-4 w-4 text-green-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-gray-400 font-medium">Oluşturan</p>
          <p className="text-[12px] font-semibold text-gray-800 truncate">
            {loading ? '…' : creatorName}
          </p>
        </div>
      </div>

      {/* Audit log list */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-gray-100 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-8 text-center text-[12px] text-gray-400">
            Aktivite kaydı bulunamadı
          </div>
        ) : (
          <div className="divide-y divide-gray-50 px-1 py-1">
            {logs.map(log => {
              const meta = resolveLabel(log);
              const IconComp = meta.icon;
              return (
                <div key={log.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', meta.dot + '/15')}>
                    <IconComp className={cn('h-3 w-3', meta.text)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-semibold text-gray-800 truncate">
                      {userName(log.user_id)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      <span className={cn('font-semibold', meta.text)}>{meta.label}</span>
                      {' · '}
                      {fTs(log.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={openPopover}
        className={cn(
          'w-7 h-7 flex items-center justify-center rounded-lg transition-colors',
          open
            ? 'bg-blue-100 text-blue-600'
            : 'text-gray-300 hover:text-blue-500 hover:bg-blue-50',
        )}
        title="Dosya aktivitesi"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {popover}
    </div>
  );
}
