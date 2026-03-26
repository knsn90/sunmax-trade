import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, LoadingSpinner } from '@/components/ui/shared';
import { toast } from 'sonner';
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
  const diff = new Date(iso + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0);
  return Math.ceil(diff / 86400000);
}

const GROUPS: { key: NotifGroup; label: string; emoji: string; color: string }[] = [
  { key: 'customs',   label: 'Customs',       emoji: '🛃', color: 'blue'   },
  { key: 'warehouse', label: 'Warehouse',     emoji: '📦', color: 'amber'  },
  { key: 'port',      label: 'Port',          emoji: '⚓', color: 'cyan'   },
  { key: 'company',   label: 'Company Group', emoji: '🏢', color: 'purple' },
];

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-red-50 text-red-600 border-red-200',
  changed:   'bg-amber-50 text-amber-700 border-amber-200',
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  file: TradeFile;
  writable: boolean;
}

export function TransportPlanSection({ file, writable }: Props) {
  const { profile } = useAuth();
  const { data: plan, isLoading } = useTransportPlan(file.id);

  const upsertPlan     = useUpsertPlan(file.id);
  const updateCheck    = useUpdateChecklist(file.id, plan?.id ?? '');
  const addPlates      = useAddPlates(file.id, plan?.id ?? '');
  const updatePlate    = useUpdatePlate(file.id);
  const deletePlate    = useDeletePlate(file.id);
  const upsertNotif    = useUpsertNotification(file.id);
  const markSent       = useMarkNotifSent(file.id);

  // Header info form
  const [loadingDate,    setLoadingDate]    = useState('');
  const [freightCompany, setFreightCompany] = useState('');
  const [headerSaved,    setHeaderSaved]    = useState(false);

  // Sync from loaded plan
  useEffect(() => {
    if (plan) {
      setLoadingDate(plan.loading_date ?? '');
      setFreightCompany(plan.freight_company ?? '');
    }
  }, [plan?.id]);

  // Paste panel
  const [pasteText,  setPasteText]  = useState('');
  const [parsed,     setParsed]     = useState<string[]>([]);
  const [showPaste,  setShowPaste]  = useState(false);

  // Editing plates
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editData,   setEditData]   = useState<Partial<TransportPlate>>({});

  // Notification panels
  const [openGroup,  setOpenGroup]  = useState<NotifGroup | null>(null);
  const [notifTexts, setNotifTexts] = useState<Record<string, string>>({});

  // ── Derived ────────────────────────────────────────────────────────────────
  const plates     = plan?.transport_plates ?? [];
  const notifs     = plan?.transport_notifications ?? [];
  const activePlates = plates.filter(p => p.plate_status !== 'cancelled');
  const days       = daysUntil(plan?.loading_date ?? null);
  const isOverdue  = days !== null && days < 0;
  const isUrgent   = days !== null && days >= 0 && days <= 1;
  const hasUnnotif = notifs.some(n => n.send_status === 'pending');
  const hasCancelled = plates.some(p => p.plate_status === 'cancelled');

  const modeIsSet = file.transport_mode === 'truck' || file.transport_mode === 'railway';

  // ── Actions ────────────────────────────────────────────────────────────────
  async function saveHeader() {
    await upsertPlan.mutateAsync({ loading_date: loadingDate || null, freight_company: freightCompany });
    setHeaderSaved(true);
    setTimeout(() => setHeaderSaved(false), 2000);
  }

  function handleParse() {
    const found = parsePlatesFromText(pasteText);
    if (!found.length) { toast.error('No plate numbers found in text'); return; }
    // Filter out already-existing plates
    const existing = new Set(plates.map(p => p.plate_no.toUpperCase()));
    const newPlates = found.filter(p => !existing.has(p.toUpperCase()));
    setParsed(newPlates);
    if (!newPlates.length) toast.info('All plates are already in the list');
  }

  async function confirmAddPlates() {
    if (!plan) {
      // Create plan first
      const created = await upsertPlan.mutateAsync({
        loading_date: loadingDate || null,
        freight_company: freightCompany,
      });
      await addPlatesToNewPlan(created.id, parsed);
    } else {
      await addPlates.mutateAsync(parsed);
    }
    setParsed([]);
    setPasteText('');
    setShowPaste(false);
  }

  // Helper to add plates when plan was just created inline
  async function addPlatesToNewPlan(planId: string, plateNos: string[]) {
    await transportService.addPlates(planId, plateNos);
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
      fileNo:        file.file_no,
      productName:   file.product?.name ?? file.notes ?? '',
      loadingDate:   plan?.loading_date ?? null,
      plates:        effPlates,
      freightCompany: plan?.freight_company ?? '',
      portOfLoading:  file.port_of_loading ?? null,
      transportMode:  file.transport_mode ?? 'truck',
    });
  }

  function openNotifGroup(group: NotifGroup) {
    setOpenGroup(group);
    const existing = notifs.find(n => n.target_group === group);
    setNotifTexts(prev => ({
      ...prev,
      [group]: existing?.notification_text || buildNotifText(group),
    }));
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

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4">

      {/* ── Transport type banner ── */}
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${
        !modeIsSet
          ? 'bg-amber-50 border-amber-200'
          : file.transport_mode === 'truck'
            ? 'bg-blue-50 border-blue-200'
            : 'bg-indigo-50 border-indigo-200'
      }`}>
        {!modeIsSet ? (
          <><AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-700 font-medium">
            Transport mode not set — edit the file to choose one.
          </span></>
        ) : file.transport_mode === 'truck' ? (
          <><Truck className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span className="text-sm text-blue-700 font-semibold">Truck Transport Planned</span></>
        ) : (
          <><Train className="h-4 w-4 text-indigo-600 flex-shrink-0" />
          <span className="text-sm text-indigo-700 font-semibold">Railway Transport Planned</span></>
        )}
      </div>

      {/* ── Alarms ── */}
      {isOverdue && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            ⚠️ Loading date has passed! ({fmtDate(plan?.loading_date ?? null)})
          </span>
        </div>
      )}
      {isUrgent && !isOverdue && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Bell className="h-4 w-4 text-amber-500 flex-shrink-0" />
          <span className="text-sm text-amber-700 font-medium">
            🔔 Loading {days === 0 ? 'today' : 'tomorrow'}! ({fmtDate(plan?.loading_date ?? null)})
          </span>
        </div>
      )}
      {hasUnnotif && plan && activePlates.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl">
          <Bell className="h-4 w-4 text-orange-500 flex-shrink-0" />
          <span className="text-sm text-orange-700 font-medium">Some groups have pending notifications</span>
        </div>
      )}
      {hasCancelled && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl">
          <X className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700 font-medium">
            {plates.filter(p => p.plate_status === 'cancelled').length} cancelled plate(s)
          </span>
        </div>
      )}

      {/* ── Header info card ── */}
      <Card>
        <CardContent>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-red-600" />
            <span className="font-semibold text-sm">Plan Details</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Loading Date</label>
              <Input
                type="date"
                value={loadingDate}
                onChange={e => setLoadingDate(e.target.value)}
                disabled={!writable}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Freight Company</label>
              <Input
                value={freightCompany}
                onChange={e => setFreightCompany(e.target.value)}
                placeholder="Company name"
                disabled={!writable}
              />
            </div>
          </div>
          {writable && (
            <Button size="sm" className="mt-3 bg-red-600 hover:bg-red-700 text-white" onClick={saveHeader}
              disabled={upsertPlan.isPending}>
              {headerSaved ? '✓ Saved' : 'Save'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ── Plate list ── */}
      <Card>
        <CardContent>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-red-600" />
              <span className="font-semibold text-sm">Plate List</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                {activePlates.length} active
              </span>
            </div>
            {writable && plan && (
              <Button size="xs" variant="outline" onClick={() => setShowPaste(v => !v)}>
                <Plus className="h-3 w-3 mr-1" /> Add Plate
              </Button>
            )}
          </div>

          {/* Paste panel */}
          {showPaste && plan && (
            <div className="mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
              <p className="text-xs text-gray-500">
                Paste a plate list copied from WhatsApp — plates will be detected automatically.
              </p>
              <textarea
                className="w-full text-xs border border-gray-200 rounded-lg p-2 h-28 resize-none focus:outline-none focus:ring-2 focus:ring-red-200"
                placeholder="Paste plate list here…&#10;e.g. 34 ABC 123, 06-BKT-789"
                value={pasteText}
                onChange={e => { setPasteText(e.target.value); setParsed([]); }}
              />
              <div className="flex gap-2">
                <Button size="xs" onClick={handleParse} disabled={!pasteText.trim()}>
                  🔍 Detect
                </Button>
                {parsed.length > 0 && (
                  <Button size="xs" className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={confirmAddPlates} disabled={addPlates.isPending}>
                    ✓ Add {parsed.length} plate(s)
                  </Button>
                )}
                <Button size="xs" variant="outline" onClick={() => { setShowPaste(false); setParsed([]); setPasteText(''); }}>
                  Cancel
                </Button>
              </div>
              {parsed.length > 0 && (
                <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg p-2">
                  Detected: {parsed.join(' · ')}
                </div>
              )}
            </div>
          )}

          {/* No plan yet */}
          {!plan && (
            <div className="text-center py-8 text-sm text-gray-400">
              Save plan details first, then you can add plates.
            </div>
          )}

          {/* Plate table */}
          {plates.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-gray-50">
                    {['#', 'Plate', 'Driver', 'Status', 'Note', writable ? 'Actions' : ''].map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left font-semibold text-gray-500 uppercase text-[10px]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plates.map((plate, idx) => (
                    <tr key={plate.id} className={`border-b hover:bg-gray-50 ${plate.plate_status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-2 py-2 text-gray-400">{idx + 1}</td>
                      <td className="px-2 py-2 font-mono font-semibold">
                        {editingId === plate.id ? (
                          <Input className="h-6 text-xs w-28"
                            value={editData.plate_no ?? ''}
                            onChange={e => setEditData(d => ({ ...d, plate_no: e.target.value }))} />
                        ) : (
                          <>
                            <span className={plate.plate_status === 'cancelled' ? 'line-through text-gray-400' : ''}>
                              {plate.plate_no}
                            </span>
                            {plate.plate_status === 'changed' && plate.replacement_plate && (
                              <span className="ml-2 text-amber-600">→ {plate.replacement_plate}</span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-500">
                        {editingId === plate.id ? (
                          <Input className="h-6 text-xs w-28"
                            value={editData.driver_name ?? ''}
                            onChange={e => setEditData(d => ({ ...d, driver_name: e.target.value }))} />
                        ) : plate.driver_name || '—'}
                      </td>
                      <td className="px-2 py-2">
                        {editingId === plate.id ? (
                          <select className="text-xs border rounded px-1 h-6"
                            value={editData.plate_status ?? 'active'}
                            onChange={e => setEditData(d => ({ ...d, plate_status: e.target.value as 'active' | 'cancelled' | 'changed' }))}>
                            <option value="active">Active</option>
                            <option value="changed">Changed</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        ) : (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${STATUS_STYLE[plate.plate_status]}`}>
                            {plate.plate_status === 'active' ? 'Active' : plate.plate_status === 'cancelled' ? 'Cancelled' : 'Changed'}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-gray-400 max-w-[120px] truncate">
                        {editingId === plate.id && editData.plate_status === 'changed' ? (
                          <Input className="h-6 text-xs w-24" placeholder="New plate"
                            value={editData.replacement_plate ?? ''}
                            onChange={e => setEditData(d => ({ ...d, replacement_plate: e.target.value }))} />
                        ) : editingId === plate.id && editData.plate_status === 'cancelled' ? (
                          <Input className="h-6 text-xs w-24" placeholder="Cancel reason"
                            value={editData.cancel_reason ?? ''}
                            onChange={e => setEditData(d => ({ ...d, cancel_reason: e.target.value }))} />
                        ) : plate.cancel_reason || ''}
                      </td>
                      {writable && (
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-1">
                            {editingId === plate.id ? (
                              <>
                                <button onClick={() => saveEdit(plate.id)}
                                  className="text-green-600 hover:text-green-700 p-0.5">
                                  <CheckCheck className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => setEditingId(null)}
                                  className="text-gray-400 hover:text-gray-600 p-0.5">
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button onClick={() => startEdit(plate)}
                                  className="text-blue-500 hover:text-blue-700 p-0.5">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button onClick={() => deletePlate.mutate(plate.id)}
                                  className="text-red-400 hover:text-red-600 p-0.5">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Notification groups ── */}
      {plan && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Bell className="h-4 w-4 text-red-600" />
              <span className="font-semibold text-sm">Notifications</span>
            </div>
            <div className="space-y-2">
              {GROUPS.map(({ key, label, emoji }) => {
                const notif = notifs.find((n: TransportNotification) => n.target_group === key);
                const sent  = notif?.send_status === 'sent' || notif?.send_status === 'resent';
                const isOpen = openGroup === key;

                return (
                  <div key={key} className="border border-gray-100 rounded-xl overflow-hidden">
                    <button
                      className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors ${
                        sent ? 'bg-green-50/60' : ''
                      }`}
                      onClick={() => { isOpen ? setOpenGroup(null) : openNotifGroup(key); }}
                    >
                      <div className="flex items-center gap-2">
                        <span>{emoji}</span>
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                        {sent && (
                          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                            ✓ Sent
                          </span>
                        )}
                        {!sent && notif && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                            Pending
                          </span>
                        )}
                      </div>
                      {isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2">
                        <div className="flex justify-end">
                          <button
                            onClick={() => regenerateText(key)}
                            className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1"
                          >
                            <RefreshCw className="h-3 w-3" /> Regenerate
                          </button>
                        </div>
                        <textarea
                          className="w-full text-xs border border-gray-200 rounded-lg p-3 h-40 resize-y focus:outline-none focus:ring-2 focus:ring-red-200 font-mono"
                          value={notifTexts[key] ?? ''}
                          onChange={e => setNotifTexts(prev => ({ ...prev, [key]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button size="xs" onClick={() => saveAndCopyNotif(key)}
                            disabled={upsertNotif.isPending}>
                            <Copy className="h-3 w-3 mr-1" /> Copy
                          </Button>
                          <Button size="xs" variant="outline"
                            className={sent ? 'border-amber-300 text-amber-700' : 'border-green-300 text-green-700'}
                            onClick={() => handleMarkSent(key)}
                            disabled={markSent.isPending}>
                            <CheckCheck className="h-3 w-3 mr-1" />
                            {sent ? 'Mark Re-sent' : 'Mark as Sent'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Closure checklist ── */}
      {plan && (
        <Card>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="h-4 w-4 text-red-600" />
              <span className="font-semibold text-sm">Task Closure</span>
              {plan.customs_approval && plan.tir_carnet && plan.t1_document && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                  ✅ Completed
                </span>
              )}
            </div>
            <div className="space-y-2">
              {[
                { key: 'customs_approval', label: 'Customs Approval Obtained' },
                { key: 'tir_carnet',       label: 'TIR Carnet Completed' },
                { key: 't1_document',      label: 'T1 Document Prepared' },
              ].map(({ key, label }) => (
                <label key={key} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  (plan as any)[key] ? 'bg-green-50 border-green-200' : 'border-gray-100 hover:bg-gray-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={(plan as any)[key]}
                    disabled={!writable}
                    className="accent-red-600 w-4 h-4"
                    onChange={e => {
                      if (!writable) return;
                      updateCheck.mutate({ [key]: e.target.checked });
                    }}
                  />
                  <span className={`text-sm font-medium ${(plan as any)[key] ? 'text-green-700 line-through' : 'text-gray-700'}`}>
                    {label}
                  </span>
                  {(plan as any)[key] && <CheckCheck className="h-4 w-4 text-green-600 ml-auto" />}
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
