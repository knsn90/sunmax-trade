import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { packingListSchema, type PackingListFormData } from '@/types/forms';
import type { TradeFile, PackingList, Customer } from '@/types/database';
import { useCreatePackingList, useUpdatePackingList } from '@/hooks/useDocuments';
import { packingListService } from '@/services/packingListService';
import { useCustomers } from '@/hooks/useEntities';
import { useSettings } from '@/hooks/useSettings';
import { today, fN } from '@/lib/formatters';
import { formatPLNo } from '@/lib/generators';
import { parsePLExcel, downloadPLTemplate } from '@/lib/excelImport';
import { printPackingList } from '@/lib/printDocument';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect, Textarea } from '@/components/ui/form-elements';
import { FormRow, FormGroup } from '@/components/ui/shared';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';
import { MonoNumberInput } from '@/components/ui/MonoNumberInput';
import { OcrButton } from '@/components/ui/OcrButton';
import { SmartFill } from '@/components/ui/SmartFill';
import type { OcrResult } from '@/lib/openai';

interface PackingListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: TradeFile | null;
  packingList?: PackingList | null;
}

interface PLRow {
  vehicle_plate: string;
  reels: number;
  admt: number;
  gross_weight_kg: number;
}

/** Build a multi-line address block from a customer record */
function buildAddress(customer: Customer | undefined): string {
  const parts = [
    customer?.name,
    customer?.address,
    [customer?.city, customer?.country].filter(Boolean).join(', '),
  ].filter(Boolean);
  return parts.join('\n');
}

const UNIT_LABELS = ['Reels', 'Bales', 'Packages', 'Cartons'] as const;
const QTY_UNITS   = ['ADMT', 'MT'] as const;

export function PackingListModal({ open, onOpenChange, file, packingList }: PackingListModalProps) {
  const { data: settings } = useSettings();
  const { data: allCustomers = [] } = useCustomers();
  const createPL = useCreatePackingList();
  const updatePL = useUpdatePackingList();
  const isEdit = !!packingList;
  const [saving, setSaving] = useState(false);

  // ── Consignee (Alıcı Firma) ───────────────────────────────────────────
  const [consigneeId, setConsigneeId] = useState<string>('');
  const mainCustomerId = file?.customer_id ?? '';
  const subCustomers = allCustomers.filter(c => c.parent_customer_id === mainCustomerId);
  const mainCustomer = allCustomers.find(c => c.id === mainCustomerId);
  const hasSubCustomers = subCustomers.length > 0;

  const [rows, setRows] = useState<PLRow[]>([{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }]);
  const importRef = useRef<HTMLInputElement>(null);

  const form = useForm<PackingListFormData>({
    resolver: zodResolver(packingListSchema),
  });

  const { register, handleSubmit, formState: { errors }, reset, setValue, control } = form;
  const transportMode = useWatch({ control, name: 'transport_mode' }) ?? 'truck';
  const unitLabel     = useWatch({ control, name: 'unit_label' }) ?? 'Reels';
  const qtyUnit       = useWatch({ control, name: 'qty_unit' }) ?? 'ADMT';

  // ── Auto-fill bill_to/ship_to when customer data loads (async) ────────
  // mainCustomer is derived from allCustomers which may not be ready
  // when the form first opens, so we fill when it becomes available.
  useEffect(() => {
    if (!open || !mainCustomer) return;
    // Only fill if the field is still empty (don't overwrite user edits)
    if (!form.getValues('bill_to')) {
      setValue('bill_to', buildAddress(mainCustomer));
    }
    if (!form.getValues('ship_to')) {
      setValue('ship_to', buildAddress(mainCustomer));
    }
  }, [open, mainCustomer]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill ship_to when consignee changes ──────────────────────────
  useEffect(() => {
    if (!open) return;
    const consignee = allCustomers.find(c => c.id === consigneeId);
    if (consigneeId && consignee) {
      setValue('ship_to', buildAddress(consignee));
    } else if (mainCustomer) {
      setValue('ship_to', buildAddress(mainCustomer));
    }
  }, [consigneeId, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    if (packingList) {
      setConsigneeId(packingList.consignee_customer_id ?? '');
      const items = packingList.packing_list_items?.map(i => ({
        vehicle_plate: i.vehicle_plate,
        reels: i.reels,
        admt: i.admt,
        gross_weight_kg: i.gross_weight_kg,
      })) ?? [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }];
      setRows(items);
      reset({
        pl_date:        packingList.pl_date,
        transport_mode: packingList.transport_mode,
        invoice_no:     packingList.invoice_no ?? '',
        cb_no:          packingList.cb_no ?? '',
        insurance_no:   packingList.insurance_no ?? '',
        description:    packingList.description ?? '',
        comments:       packingList.comments ?? '',
        // If DB columns don't exist yet (pre-migration) fall back gracefully
        bill_to:        (packingList as { bill_to?: string | null }).bill_to ?? '',
        ship_to:        (packingList as { ship_to?: string | null }).ship_to ?? '',
        unit_label:     ((packingList as { unit_label?: string }).unit_label as PackingListFormData['unit_label']) ?? 'Reels',
        qty_unit:       ((packingList as { qty_unit?: string }).qty_unit   as PackingListFormData['qty_unit'])   ?? 'ADMT',
        items,
      });
    } else if (file) {
      setConsigneeId('');
      const initialRows = [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }];
      setRows(initialRows);
      reset({
        pl_date:        today(),
        transport_mode: file.transport_mode ?? 'truck',
        invoice_no:     '',
        cb_no:          '',
        insurance_no:   file.insurance_tr ?? '',
        description:    file.product?.name ?? 'FLUFF PULP',
        comments:       '',
        bill_to:        buildAddress(mainCustomer),
        ship_to:        buildAddress(mainCustomer),
        unit_label:     'Reels',
        qty_unit:       'ADMT',
        items:          initialRows,
      });
    }
  }, [open, file, packingList, reset]); // eslint-disable-line react-hooks/exhaustive-deps

  function addRow() {
    const newRows = [...rows, { vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }];
    setRows(newRows);
    setValue('items', newRows);
  }

  function removeRow(index: number) {
    const newRows = rows.filter((_, i) => i !== index);
    setRows(newRows.length > 0 ? newRows : [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }]);
    setValue('items', newRows.length > 0 ? newRows : [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }]);
  }

  function updateRow(index: number, field: keyof PLRow, value: string | number) {
    const newRows = [...rows];
    (newRows[index] as unknown as Record<string, string | number>)[field] = value;
    setRows(newRows);
    setValue('items', newRows);
  }

  const totalReels = rows.reduce((s, r) => s + (r.reels || 0), 0);
  const totalAdmt  = rows.reduce((s, r) => s + (r.admt || 0), 0);
  const totalGross = rows.reduce((s, r) => s + (r.gross_weight_kg || 0), 0);

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    try {
      const imported = await parsePLExcel(f);
      if (!imported.length) { toast.error('No rows found in file'); return; }
      setRows(imported);
      setValue('items', imported);
      toast.success(`${imported.length} rows imported`);
    } catch {
      toast.error('Could not parse file. Please use the Excel template.');
    }
  }

  function handleOcrResult(result: OcrResult) {
    if (result.date) setValue('pl_date', result.date);
    if (result.items && result.items.length > 0) {
      const mapped: PLRow[] = result.items.map((r) => ({
        vehicle_plate: r.vehicle_plate ?? '',
        reels:         r.reels ?? 0,
        admt:          r.admt ?? 0,
        gross_weight_kg: r.gross_weight_kg ?? 0,
      }));
      setRows(mapped);
      setValue('items', mapped);
    }
  }

  function handlePrint() {
    if (!packingList) { toast.error('Save the packing list first to print it.'); return; }
    if (!settings) return;
    const isDraft = (packingList.doc_status ?? 'draft') !== 'approved';
    printPackingList(packingList, settings, isDraft);
  }

  async function onSubmit(data: PackingListFormData) {
    setSaving(true);
    try {
      data.items = rows;
      const cId = consigneeId || undefined;
      if (isEdit && packingList) {
        await updatePL.mutateAsync({ id: packingList.id, data, consigneeId: cId });
      } else if (file) {
        const baseNo = formatPLNo(file.file_no);
        const plNo = await packingListService.generateUniquePLNo(file.id, baseNo);
        await createPL.mutateAsync({ tradeFileId: file.id, customerId: file.customer_id, plNo, data, consigneeId: cId });
      }
      onOpenChange(false);
    } catch {
      // Error shown via onError toast
    } finally {
      setSaving(false);
    }
  }

  if (!file && !packingList) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <DialogTitle>{isEdit ? 'Edit Packing List' : 'New Packing List'}</DialogTitle>
              <DialogDescription className="truncate">
                {file?.file_no ?? ''} — {consigneeId ? (allCustomers.find(c => c.id === consigneeId)?.name ?? file?.customer?.name ?? '') : (file?.customer?.name ?? '')}
              </DialogDescription>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <SmartFill mode="packing_list" onResult={handleOcrResult} formName="Packing List" />
              <OcrButton mode="packing_list" onResult={handleOcrResult} label="Read Packing List" />
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>

          {/* ── Alıcı Firma (Consignee) — sadece alt firma varsa göster ── */}
          {hasSubCustomers && (
            <div className="mb-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
              <label className="block text-[10px] font-bold uppercase tracking-widest text-blue-600 mb-1.5">
                Alıcı Firma (Consignee)
              </label>
              <NativeSelect
                value={consigneeId}
                onChange={e => setConsigneeId(e.target.value)}
                className="text-[12px]"
              >
                <option value="">{mainCustomer?.name ?? '—'} (Ana Firma)</option>
                {subCustomers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </NativeSelect>
              <p className="text-[10px] text-blue-500 mt-1">Muhasebe değişmez — sadece evrak üzerindeki alıcı adı değişir.</p>
            </div>
          )}

          {/* ── Bill To / Ship To ─────────────────────────────────────── */}
          <FormRow cols={2}>
            <FormGroup label="Bill To">
              <Textarea
                rows={3}
                {...register('bill_to')}
                className="text-[12px] resize-none"
                placeholder={`Firma adı\nAdres\nŞehir, Ülke`}
              />
            </FormGroup>
            <FormGroup label="Ship To">
              <Textarea
                rows={3}
                {...register('ship_to')}
                className="text-[12px] resize-none"
                placeholder={`Teslim adresi\nAdres\nŞehir, Ülke`}
              />
            </FormGroup>
          </FormRow>

          {/* ── Temel Bilgiler ────────────────────────────────────────── */}
          <FormRow cols={3}>
            <FormGroup label="Date *" error={errors.pl_date?.message}>
              <MonoDatePicker value={form.watch('pl_date') ?? ''} onChange={v => setValue('pl_date', v)} />
            </FormGroup>
            <FormGroup label="Transport Mode">
              <NativeSelect {...register('transport_mode')}>
                <option value="truck">By Truck</option>
                <option value="railway">By Railway</option>
                <option value="sea">By Sea</option>
              </NativeSelect>
            </FormGroup>
            <FormGroup label="Description">
              <Input {...register('description')} />
            </FormGroup>
          </FormRow>

          <FormRow cols={3}>
            <FormGroup label="Invoice No.">
              <Input {...register('invoice_no')} />
            </FormGroup>
            <FormGroup label="CB No.">
              <Input {...register('cb_no')} />
            </FormGroup>
            <FormGroup label="Insurance No.">
              <Input {...register('insurance_no')} />
            </FormGroup>
          </FormRow>

          {/* ── Unit selectors (above table) ─────────────────────────── */}
          <div className="flex items-center gap-4 mb-2 px-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Count Unit</span>
              <div className="flex gap-1">
                {UNIT_LABELS.map(lbl => (
                  <button
                    key={lbl}
                    type="button"
                    onClick={() => setValue('unit_label', lbl)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      unitLabel === lbl
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Qty Unit</span>
              <div className="flex gap-1">
                {QTY_UNITS.map(u => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setValue('qty_unit', u)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      qtyUnit === u
                        ? 'bg-gray-800 text-white'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Vehicle rows table ────────────────────────────────────── */}
          <div className="border border-border rounded-lg overflow-hidden mb-3 overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-left w-8">#</th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-left">
                    {transportMode === 'truck' ? 'TIR No / Plate' : 'Wagon No'}
                  </th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-center w-24">{unitLabel}</th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-center w-24">{qtyUnit}</th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-center w-24">Gross (KG)</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 text-2xs text-muted-foreground">{i + 1}</td>
                    <td className="px-1 py-1">
                      <Input
                        value={row.vehicle_plate}
                        onChange={(e) => updateRow(i, 'vehicle_plate', e.target.value)}
                        placeholder={transportMode === 'truck' ? '04AAE583 / 04AAZ457' : 'WAGON-001'}
                      />
                    </td>
                    <td className="px-1 py-1">
                      <MonoNumberInput
                        value={row.reels || undefined}
                        onChange={v => updateRow(i, 'reels', v ?? 0)}
                        decimals={0}
                        className="bg-gray-100 rounded-lg h-8 px-2 text-[12px] text-gray-900 border-0 focus:outline-none focus:ring-0 w-full text-center"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <MonoNumberInput
                        value={row.admt || undefined}
                        onChange={v => updateRow(i, 'admt', v ?? 0)}
                        decimals={3}
                        className="bg-gray-100 rounded-lg h-8 px-2 text-[12px] text-gray-900 border-0 focus:outline-none focus:ring-0 w-full text-center"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <MonoNumberInput
                        value={row.gross_weight_kg || undefined}
                        onChange={v => updateRow(i, 'gross_weight_kg', v ?? 0)}
                        decimals={3}
                        className="bg-gray-100 rounded-lg h-8 px-2 text-[12px] text-gray-900 border-0 focus:outline-none focus:ring-0 w-full text-center"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Button type="button" variant="destructive" size="xs" onClick={() => removeRow(i)}>×</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              className="border-t border-dashed border-border py-2 text-center text-[11px] text-muted-foreground cursor-pointer hover:bg-gray-50"
              onClick={addRow}
            >
              + Add Row
            </div>
          </div>

          {/* ── Totals ───────────────────────────────────────────────── */}
          <div className="bg-brand-50 rounded-lg px-3.5 py-2.5 mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>Vehicles: <strong>{rows.length}</strong></div>
            <div>{unitLabel}: <strong>{totalReels}</strong></div>
            <div>{qtyUnit}: <strong className="text-brand-600">{fN(totalAdmt, 3)}</strong></div>
            <div>Gross: <strong>{fN(totalGross, 0)}</strong></div>
          </div>

          <FormGroup label="Comments" className="mb-2.5">
            <Textarea rows={3} {...register('comments')} />
          </FormGroup>

          <DialogFooter>
            {/* Hidden file input for Excel import */}
            <input
              ref={importRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFile}
            />
            <div className="flex flex-wrap gap-2 w-full sm:w-auto sm:flex-1">
              <Button type="button" variant="outline" size="sm" onClick={() => downloadPLTemplate()}>
                ↓ Template
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => importRef.current?.click()}>
                ↑ Import Excel
              </Button>
            </div>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            {isEdit && (
              <Button type="button" variant="outline" onClick={handlePrint}>
                🖨 Print / PDF
              </Button>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Update Packing List' : 'Save Packing List'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
