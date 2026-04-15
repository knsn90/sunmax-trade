import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import {
  useTransportPlan, useUpsertPlan, useUpdateChecklist,
  useAddPlates, useUpdatePlate, useDeletePlate,
  useUpsertNotification, useMarkNotifSent,
} from '@/hooks/useTransportPlan';
import { parsePlatesFromText } from '@/lib/parsePlates';
import { transportService } from '@/services/transportService';
import { buildNotificationText, type NotifGroup } from '@/lib/buildNotificationText';
import type { TradeFile } from '@/types/database';
import type { TransportPlate, TransportNotification } from '@/services/transportService';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Truck, Train, ClipboardList, Bell, CheckSquare, AlertTriangle,
  Plus, Trash2, RefreshCw, Copy, CheckCheck, X, ChevronDown, ChevronUp,
  Pencil, AlertCircle,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB');
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(diff / 86400000);
}

const GROUPS: { key: NotifGroup; label: string; emoji: string }[] = [
  { key: 'customs',   label: 'Customs',       emoji: '🛃' },
  { key: 'warehouse', label: 'Warehouse',     emoji: '📦' },
  { key: 'port',      label: 'Port',          emoji: '⚓' },
  { key: 'company',   label: 'Company Group', emoji: '🏢' },
];

const PLATE_STATUS_META = {
  active:    { dot: 'bg-green-400', text: 'text-green-700', bg: 'bg-green-50',  label: 'Active'     },
  cancelled: { dot: 'bg-red-400',   text: 'text-red-600',   bg: 'bg-red-50',    label: 'Cancelled'  },
  changed:   { dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50',  label: 'Changed'    },
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  file: TradeFile;
  writable: boolean;
}

export function TransportPlanSection({ file, writable }: Props) {
  const { profile } = useAuth();
  const { accent } = useTheme();

  const { data: plan, isLoading } = useTransportPlan(file.id);
  const upsertPlan  = useUpsertPlan(file.id);
  const updateCheck = useUpdateChecklist(file.id, plan?.id ?? '');
  const addPlates   = useAddPlates(file.id, plan?.id ?? '');
  const updatePlate = useUpdatePlate(file.id);
  const deletePlate = useDeletePlate(file.id);
  const upsertNotif = useUpsertNotification(file.id);
  const markSent    = useMarkNotifSent(file.id);

  const [loadingDate,    setLoadingDate]    = useState('');
  const [freightCompany, setFreightCompany] = useState('');
  const [headerSaved,    setHeaderSaved]    = useState(false);

  useEffect(() => {
    if (plan) {
      setLoadingDate(plan.loading_date ?? '');
      setFreightCompany(plan.freight_company ?? '');
    }
  }, [plan?.id]);

  const [pasteText, setPasteText] = useState('');
  const [parsed,    setParsed]    = useState<string[]>([]);
  const [showPaste, setShowPaste] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData,  setEditData]  = useState<Partial<TransportPlate>>({});

  const [openGroup,  setOpenGroup]  = useState<NotifGroup | null>(null);
  const [notifTexts, setNotifTexts] = useState<Record<string, string>>({});

  // ── Derived ─────────────────────────────────────────────────────────────────
  const plates       = plan?.transport_plates ?? [];
  const notifs       = plan?.transport_notifications ?? [];
  const activePlates = plates.filter(p => p.plate_status !== 'cancelled');
  const days         = daysUntil(plan?.loading_date ?? null);
  const isOverdue    = days !== null && days < 0;
  const isUrgent     = days !== null && days >= 0 && days <= 1;
  const hasUnnotif   = notifs.some(n => n.send_status === 'pending');
  const hasCancelled = plates.some(p => p.plate_status === 'cancelled');
  const modeIsSet    = file.transport_mode === 'truck' || file.transport_mode === 'railway' || file.transport_mode === 'sea';

  // ── Actions ─────────────────────────────────────────────────────────────────
  async function saveHeader() {
    await upsertPlan.mutateAsync({ loading_date: loadingDate || null, freight_company: freightCompany });
    setHeaderSaved(true);
    setTimeout(() => setHeaderSaved(false), 2000);
  }

  function handleParse() {
    const found = parsePlatesFromText(pasteText);
    if (!found.length) { toast.error('No plate numbers found in text'); return; }
    const existing = new Set(plates.map(p => p.plate_no.toUpperCase()));
    const newPlates = found.filter(p => !existing.has(p.toUpperCase()));
    setParsed(newPlates);
    if (!newPlates.length) toast.info('All plates are already in the list');
  }

  async function confirmAddPlates() {
    if (!plan) {
      const created = await upsertPlan.mutateAsync({ loading_date: loadingDate || null, freight_company: freightCompany });
      await transportService.addPlates(created.id, parsed);
    } else {
      await addPlates.mutateAsync(parsed);
    }
    setParsed([]);
    setPasteText('');
    setShowPaste(false);
  }

  function startEdit(plate: TransportPlate) {
    setEditingId(plate.id);
    setEditData({ plate_no: plate.plate_no, driver_name: plate.driver_name, plate_status: plate.plate_status, replacement_plate: plate.replacement_plate, cancel_reason: plate.cancel_reason });
  }

  async function saveEdit(id: string) {
    await updatePlate.mutateAsync({ id, values: editData });
    setEditingId(null);
  }

  function buildNotifText(group: NotifGroup): string {
    const effPlates = plates
      .filter(p => p.plate_status !== 'cancelled')
      .map(p => p.plate_status === 'changed' && p.replacement_plate ? p.replacement_plate : p.plate_no);
    return buildNotificationText(group, {
      fileNo:         file.file_no,
      productName:    file.product?.name ?? file.notes ?? '',
      loadingDate:    plan?.loading_date ?? null,
      plates:         effPlates,
      freightCompany: plan?.freight_company ?? '',
      portOfLoading:  file.port_of_loading ?? null,
      transportMode:  file.transport_mode ?? 'truck',
    });
  }

  function openNotifGroup(group: NotifGroup) {
    setOpenGroup(group);
    const existing = notifs.find(n => n.target_group === group);
    setNotifTexts(prev => ({ ...prev, [group]: existing?.notification_text || buildNotifText(group) }));
  }

  async function saveAndCopyNotif(group: NotifGroup) {
    if (!plan) return;
    const text = notifTexts[group] || buildNotifText(group);
    await upsertNotif.mutateAsync({ planId: plan.id, group, text });
    await navigator.clipboard.writeText(text);
    toast.success('Copied ✓');
  }

  async function handleMarkSent(group: NotifGroup) {
    if (!plan || !profile) return;
    await markSent.mutateAsync({ planId: plan.id, group, userId: profile.id });
  }

  function regenerateText(group: NotifGroup) {
    setNotifTexts(prev => ({ ...prev, [group]: buildNotifText(group) }));
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex justify-center py-8">
      <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: 'var(--color-accent, #dc2626)' }} />
    </div>
  );

  return (
    <div className="space-y-4">

      {/* ── Alert pills ── */}
      {(isOverdue || isUrgent || hasUnnotif || hasCancelled || !modeIsSet) && (
        <div className="flex flex-wrap gap-2">
          {!modeIsSet && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
              <AlertTriangle className="h-3 w-3" /> Nakliye türü seçilmedi
            </span>
          )}
          {isOverdue && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
              <AlertCircle className="h-3 w-3" /> Yükleme tarihi geçti ({fmtDate(plan?.loading_date ?? null)})
            </span>
          )}
          {isUrgent && !isOverdue && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-full">
              <Bell className="h-3 w-3" /> Yükleme {days === 0 ? 'bugün' : 'yarın'}! ({fmtDate(plan?.loading_date ?? null)})
            </span>
          )}
          {hasUnnotif && plan && activePlates.length > 0 && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-100 px-2.5 py-1 rounded-full">
              <Bell className="h-3 w-3" /> Bekleyen bildirimler var
            </span>
          )}
          {hasCancelled && (
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
              <X className="h-3 w-3" /> {plates.filter(p => p.plate_status === 'cancelled').length} iptal plaka
            </span>
          )}
        </div>
      )}

      {/* ── Plan Details card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Plan Detayları</span>
          </div>
          {writable && (
            <button
              onClick={saveHeader}
              disabled={upsertPlan.isPending}
              className="text-[11px] font-semibold text-white px-3 py-1 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ background: accent }}
            >
              {headerSaved ? '✓ Kaydedildi' : 'Kaydet'}
            </button>
          )}
        </div>
        <div className="px-5 py-1">
          {/* Transport mode */}
          <div className="flex items-center justify-between py-2.5 border-b border-dashed border-gray-100">
            <span className="text-[12px] text-gray-500">Nakliye Türü</span>
            <span className={cn('flex items-center gap-1.5 text-[12px] font-bold',
              !modeIsSet ? 'text-amber-600' : file.transport_mode === 'truck' ? 'text-blue-600' : 'text-indigo-600')}>
              {!modeIsSet
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : file.transport_mode === 'truck'
                  ? <Truck className="h-3.5 w-3.5" />
                  : <Train className="h-3.5 w-3.5" />}
              {!modeIsSet ? 'Belirsiz' : file.transport_mode === 'truck' ? 'Kamyon' : 'Demiryolu'}
            </span>
          </div>
          {/* Loading date */}
          <div className="flex items-center justify-between py-2.5 border-b border-dashed border-gray-100">
            <span className="text-[12px] text-gray-500">Yükleme Tarihi</span>
            {writable ? (
              <input
                type="date"
                value={loadingDate}
                onChange={e => setLoadingDate(e.target.value)}
                className="text-[13px] font-bold text-gray-900 border-0 outline-none bg-transparent text-right"
              />
            ) : (
              <span className="text-[13px] font-bold text-gray-900">{fmtDate(loadingDate || null)}</span>
            )}
          </div>
          {/* Freight company */}
          <div className="flex items-center justify-between py-2.5">
            <span className="text-[12px] text-gray-500">Nakliye Firması</span>
            {writable ? (
              <input
                value={freightCompany}
                onChange={e => setFreightCompany(e.target.value)}
                placeholder="—"
                className="text-[13px] font-bold text-gray-900 border-0 outline-none bg-transparent text-right w-48 placeholder:text-gray-300"
              />
            ) : (
              <span className="text-[13px] font-bold text-gray-900">{freightCompany || '—'}</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Plate List card ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
          <div className="flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Plakalar</span>
            {activePlates.length > 0 && (
              <span className="text-[9px] font-extrabold text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded-full">{activePlates.length}</span>
            )}
          </div>
          {writable && (
            <button
              onClick={() => setShowPaste(v => !v)}
              className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-gray-700 transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
            >
              <Plus className="h-3 w-3" /> Plaka Ekle
            </button>
          )}
        </div>

        {/* Paste panel */}
        {showPaste && (
          <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/40 space-y-2.5">
            <p className="text-[11px] text-gray-400">WhatsApp'tan kopyalanan plaka listesini yapıştırın.</p>
            <textarea
              className="w-full text-[12px] border border-gray-200 rounded-xl p-3 h-24 resize-none outline-none focus:border-gray-300 font-mono bg-white"
              placeholder="Plaka listesini buraya yapıştırın…"
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setParsed([]); }}
            />
            <div className="flex gap-2 items-center">
              <button
                onClick={handleParse}
                disabled={!pasteText.trim()}
                className="text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg disabled:opacity-40 hover:opacity-90 transition-opacity"
                style={{ background: accent }}
              >
                Tespit Et
              </button>
              {parsed.length > 0 && (
                <button
                  onClick={confirmAddPlates}
                  disabled={addPlates.isPending}
                  className="text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition-colors"
                >
                  ✓ {parsed.length} plaka ekle
                </button>
              )}
              <button
                onClick={() => { setShowPaste(false); setParsed([]); setPasteText(''); }}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                İptal
              </button>
            </div>
            {parsed.length > 0 && (
              <p className="text-[11px] text-green-700 font-medium">Tespit edildi: {parsed.join(' · ')}</p>
            )}
          </div>
        )}

        {/* Empty */}
        {!plan && !showPaste && (
          <div className="px-5 py-8 text-center text-[12px] text-gray-400">
            Önce plan detaylarını kaydedin.
          </div>
        )}

        {/* Plate table */}
        {plates.length > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-50">
                <th className="px-5 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">#</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Plaka</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Sürücü</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Durum</th>
                <th className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">Not</th>
                {writable && <th className="px-2 py-2.5" />}
              </tr>
            </thead>
            <tbody>
              {plates.map((plate, idx) => {
                const meta = PLATE_STATUS_META[plate.plate_status as keyof typeof PLATE_STATUS_META] ?? PLATE_STATUS_META.active;
                const isCancelled = plate.plate_status === 'cancelled';
                return (
                  <tr key={plate.id} className={cn('border-b border-gray-50 transition-colors', isCancelled ? 'opacity-50' : 'hover:bg-gray-50/60')}>
                    <td className="px-5 py-3 text-[11px] text-gray-400 font-mono">{idx + 1}</td>
                    <td className="px-2 py-3">
                      {editingId === plate.id ? (
                        <Input className="h-7 text-[12px] w-28"
                          value={editData.plate_no ?? ''}
                          onChange={e => setEditData(d => ({ ...d, plate_no: e.target.value }))} />
                      ) : (
                        <span className={cn('text-[12px] font-bold font-mono', isCancelled ? 'line-through text-gray-400' : 'text-gray-900')}>
                          {plate.plate_no}
                          {plate.plate_status === 'changed' && plate.replacement_plate && (
                            <span className="ml-2 text-amber-600 font-semibold not-italic">→ {plate.replacement_plate}</span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-[12px] text-gray-500">
                      {editingId === plate.id ? (
                        <Input className="h-7 text-[12px] w-28"
                          value={editData.driver_name ?? ''}
                          onChange={e => setEditData(d => ({ ...d, driver_name: e.target.value }))} />
                      ) : (plate.driver_name || '—')}
                    </td>
                    <td className="px-2 py-3">
                      {editingId === plate.id ? (
                        <select
                          className="text-[11px] border border-gray-200 rounded-lg px-2 h-7 outline-none bg-white"
                          value={editData.plate_status ?? 'active'}
                          onChange={e => setEditData(d => ({ ...d, plate_status: e.target.value as 'active' | 'cancelled' | 'changed' }))}
                        >
                          <option value="active">Aktif</option>
                          <option value="changed">Değişti</option>
                          <option value="cancelled">İptal</option>
                        </select>
                      ) : (
                        <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full', meta.bg, meta.text)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', meta.dot)} />
                          {meta.label}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-[11px] text-gray-400 max-w-[100px] truncate">
                      {editingId === plate.id && editData.plate_status === 'changed' ? (
                        <Input className="h-7 text-[12px] w-24" placeholder="Yeni plaka"
                          value={editData.replacement_plate ?? ''}
                          onChange={e => setEditData(d => ({ ...d, replacement_plate: e.target.value }))} />
                      ) : editingId === plate.id && editData.plate_status === 'cancelled' ? (
                        <Input className="h-7 text-[12px] w-24" placeholder="İptal nedeni"
                          value={editData.cancel_reason ?? ''}
                          onChange={e => setEditData(d => ({ ...d, cancel_reason: e.target.value }))} />
                      ) : (plate.cancel_reason || '')}
                    </td>
                    {writable && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1">
                          {editingId === plate.id ? (
                            <>
                              <button onClick={() => saveEdit(plate.id)}
                                className="p-1 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                                <CheckCheck className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => setEditingId(null)}
                                className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 transition-colors">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => startEdit(plate)}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => deletePlate.mutate(plate.id)}
                                className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Notifications card ── */}
      {plan && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Bildirimler</span>
          </div>
          <div className="divide-y divide-gray-50">
            {GROUPS.map(({ key, label, emoji }) => {
              const notif = notifs.find((n: TransportNotification) => n.target_group === key);
              const sent    = notif?.send_status === 'sent' || notif?.send_status === 'resent';
              const pending = notif?.send_status === 'pending';
              const isOpen  = openGroup === key;

              return (
                <div key={key}>
                  <button
                    className={cn('w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors text-left', sent && 'bg-green-50/40')}
                    onClick={() => isOpen ? setOpenGroup(null) : openNotifGroup(key)}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-base leading-none">{emoji}</span>
                      <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                      {sent && (
                        <span className="text-[9px] font-extrabold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">GÖNDERİLDİ</span>
                      )}
                      {pending && !sent && (
                        <span className="text-[9px] font-extrabold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">BEKLEMEDE</span>
                      )}
                    </div>
                    {isOpen ? <ChevronUp className="h-3.5 w-3.5 text-gray-400" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-400" />}
                  </button>

                  {isOpen && (
                    <div className="px-5 pb-4 pt-2 bg-gray-50/30 border-t border-gray-50 space-y-2.5">
                      <div className="flex justify-end">
                        <button
                          onClick={() => regenerateText(key)}
                          className="flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Yenile
                        </button>
                      </div>
                      <textarea
                        className="w-full text-[12px] border border-gray-200 rounded-xl p-3 h-36 resize-y outline-none focus:border-gray-300 font-mono bg-white"
                        value={notifTexts[key] ?? ''}
                        onChange={e => setNotifTexts(prev => ({ ...prev, [key]: e.target.value }))}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => saveAndCopyNotif(key)}
                          disabled={upsertNotif.isPending}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                          style={{ background: accent }}
                        >
                          <Copy className="h-3 w-3" /> Kopyala
                        </button>
                        <button
                          onClick={() => handleMarkSent(key)}
                          disabled={markSent.isPending}
                          className={cn('flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                            sent ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50')}
                        >
                          <CheckCheck className="h-3 w-3" />
                          {sent ? 'Tekrar Gönderildi' : 'Gönderildi İşaretle'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Task Closure card ── */}
      {plan && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-5 py-3.5 flex items-center justify-between border-b border-gray-50 bg-gray-50/60">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Görev Kapama</span>
            </div>
            {plan.customs_approval && plan.tir_carnet && plan.t1_document && (
              <span className="text-[9px] font-extrabold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">TAMAMLANDI</span>
            )}
          </div>
          <div className="divide-y divide-gray-50">
            {[
              { key: 'customs_approval', label: 'Gümrük Onayı Alındı' },
              { key: 'tir_carnet',       label: 'TIR Karnesi Tamamlandı' },
              { key: 't1_document',      label: 'T1 Belgesi Hazırlandı' },
            ].map(({ key, label }) => {
              const checked = (plan as any)[key] as boolean;
              return (
                <label key={key} className={cn('flex items-center gap-3 px-5 py-3.5 cursor-pointer transition-colors', checked ? 'bg-green-50/40' : 'hover:bg-gray-50/60')}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!writable}
                    className="w-4 h-4 rounded accent-red-600"
                    onChange={e => { if (!writable) return; updateCheck.mutate({ [key]: e.target.checked }); }}
                  />
                  <span className={cn('text-[13px] font-semibold flex-1', checked ? 'text-green-700 line-through' : 'text-gray-800')}>
                    {label}
                  </span>
                  {checked && <CheckCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                </label>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
