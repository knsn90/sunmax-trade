import { useEffect, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { packingListSchema, type PackingListFormData } from '@/types/forms';
import type { TradeFile, PackingList } from '@/types/database';
import { useCreatePackingList, useUpdatePackingList } from '@/hooks/useDocuments';
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
import { OcrButton } from '@/components/ui/OcrButton';
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

export function PackingListModal({ open, onOpenChange, file, packingList }: PackingListModalProps) {
  const { data: settings } = useSettings();
  const createPL = useCreatePackingList();
  const updatePL = useUpdatePackingList();
  const isEdit = !!packingList;

  const [rows, setRows] = useState<PLRow[]>([{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }]);
  const importRef = useRef<HTMLInputElement>(null);

  const form = useForm<PackingListFormData>({
    resolver: zodResolver(packingListSchema),
  });

  const { register, handleSubmit, formState: { errors }, reset, setValue, control } = form;
  const transportMode = useWatch({ control, name: 'transport_mode' }) ?? 'truck';

  useEffect(() => {
    if (!open) return;
    if (packingList) {
      const items = packingList.packing_list_items?.map(i => ({
        vehicle_plate: i.vehicle_plate,
        reels: i.reels,
        admt: i.admt,
        gross_weight_kg: i.gross_weight_kg,
      })) ?? [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }];
      setRows(items);
      reset({
        pl_date: packingList.pl_date,
        transport_mode: packingList.transport_mode,
        invoice_no: packingList.invoice_no ?? '',
        cb_no: packingList.cb_no ?? '',
        insurance_no: packingList.insurance_no ?? '',
        description: packingList.description ?? '',
        comments: packingList.comments ?? '',
        items,
      });
    } else if (file) {
      const initialRows = [{ vehicle_plate: '', reels: 0, admt: 0, gross_weight_kg: 0 }];
      setRows(initialRows);
      reset({
        pl_date: today(),
        transport_mode: file.transport_mode ?? 'truck',
        invoice_no: '',
        cb_no: '',
        insurance_no: file.insurance_tr ?? '',
        description: file.product?.name ?? 'FLUFF PULP',
        comments: '',
        items: initialRows,
      });
    }
  }, [open, file, packingList, reset]);

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
  const totalAdmt = rows.reduce((s, r) => s + (r.admt || 0), 0);
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
        reels: r.reels ?? 0,
        admt: r.admt ?? 0,
        gross_weight_kg: r.gross_weight_kg ?? 0,
      }));
      setRows(mapped);
      setValue('items', mapped);
    }
  }

  function handlePrint() {
    if (!packingList) { toast.error('Save the packing list first to print it.'); return; }
    if (!settings) return;
    printPackingList(packingList, settings);
  }

  async function onSubmit(data: PackingListFormData) {
    data.items = rows;
    if (isEdit && packingList) {
      await updatePL.mutateAsync({ id: packingList.id, data });
    } else if (file) {
      const prefix = settings?.file_prefix ?? 'ESN';
      const plNo = formatPLNo(prefix, Date.now() % 10000);
      await createPL.mutateAsync({ tradeFileId: file.id, customerId: file.customer_id, plNo, data });
    }
    onOpenChange(false);
  }

  if (!file && !packingList) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{isEdit ? 'Edit Packing List' : 'New Packing List'}</DialogTitle>
              <DialogDescription>
                {file?.file_no ?? ''} — {file?.customer?.name ?? ''}
              </DialogDescription>
            </div>
            <OcrButton mode="packing_list" onResult={handleOcrResult} label="Read Packing List" />
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <FormRow cols={3}>
            <FormGroup label="Date *" error={errors.pl_date?.message}>
              <Input type="date" {...register('pl_date')} />
            </FormGroup>
            <FormGroup label="Transport Mode">
              <NativeSelect {...register('transport_mode')}>
                <option value="truck">By Truck</option>
                <option value="train">By Railway</option>
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

          {/* Vehicle rows table */}
          <div className="border border-border rounded-lg overflow-hidden mb-3">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-left w-8">#</th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-left">
                    {transportMode === 'truck' ? 'TIR No / Plate' : 'Wagon No'}
                  </th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-center w-20">Reels</th>
                  <th className="px-2 py-1.5 text-2xs font-bold text-muted-foreground text-center w-24">ADMT</th>
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
                      <Input
                        type="number"
                        value={row.reels || ''}
                        onChange={(e) => updateRow(i, 'reels', parseInt(e.target.value) || 0)}
                        className="text-center"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        step="0.001"
                        value={row.admt || ''}
                        onChange={(e) => updateRow(i, 'admt', parseFloat(e.target.value) || 0)}
                        className="text-center"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        type="number"
                        step="0.001"
                        value={row.gross_weight_kg || ''}
                        onChange={(e) => updateRow(i, 'gross_weight_kg', parseFloat(e.target.value) || 0)}
                        className="text-center"
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

          {/* Totals */}
          <div className="bg-brand-50 rounded-lg px-3.5 py-2.5 mb-3 grid grid-cols-4 gap-3 text-xs">
            <div>Vehicles: <strong>{rows.length}</strong></div>
            <div>Reels: <strong>{totalReels}</strong></div>
            <div>ADMT: <strong className="text-brand-600">{fN(totalAdmt, 3)}</strong></div>
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
            <div className="flex gap-2 flex-1">
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
            <Button type="submit" disabled={createPL.isPending || updatePL.isPending}>
              {isEdit ? 'Update Packing List' : 'Save Packing List'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
