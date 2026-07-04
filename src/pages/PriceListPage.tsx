import { useState, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Plus, Search, History, Pencil, Trash2, Tag, X, ChevronDown, TrendingUp, Sparkles,
} from 'lucide-react';
import { streamPriceListAnalysis } from '@/lib/priceListAI';
import { EntityAvatar } from '@/components/ui/shared';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import {
  usePriceList, usePriceListByProduct,
  useCreatePriceList, useUpdatePriceList, useDeletePriceList,
  useProducts, useSuppliers,
  useCreateProduct, useCreateSupplier,
} from '@/hooks/useEntities';
import { priceListSchema, type PriceListFormData } from '@/types/forms';
import type { PriceList } from '@/types/database';
import { fDate } from '@/lib/formatters';
import { MonoDatePicker } from '@/components/ui/MonoDatePicker';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRICE_PAGE_SIZE = 50;
const CURRENCIES = ['USD', 'EUR', 'TRY'] as const;
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', TRY: '₺' };


// ─── Price Entry Modal ────────────────────────────────────────────────────────

interface EntryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PriceList | null;
}

function PriceEntryModal({ open, onOpenChange, editing }: EntryModalProps) {
  const { t } = useTranslation('priceList');
  const { t: tc } = useTranslation('common');

  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const createEntry = useCreatePriceList();
  const updateEntry = useUpdatePriceList();
  const createProduct = useCreateProduct();
  const createSupplier = useCreateSupplier();

  const [prodSearch, setProdSearch] = useState('');
  const [supSearch, setSupSearch] = useState('');
  const [prodOpen, setProdOpen] = useState(false);
  const [supOpen, setSupOpen] = useState(false);
  const [addingProd, setAddingProd] = useState(false);
  const [addingSup, setAddingSup] = useState(false);
  const [newProdName, setNewProdName] = useState('');
  const [newSupName, setNewSupName] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue, watch } = useForm<PriceListFormData>({
    resolver: zodResolver(priceListSchema),
    defaultValues: {
      product_id: '', supplier_id: '', price: '' as unknown as number,
      currency: 'USD', price_date: new Date().toISOString().slice(0, 10),
      valid_until: '', notes: '',
    },
  });

  const productId = watch('product_id');
  const supplierId = watch('supplier_id');
  const selectedProduct = products.find(p => p.id === productId);
  const selectedSupplier = suppliers.find(s => s.id === supplierId);

  // Populate form when editing
  useState(() => {
    if (open && editing) {
      reset({
        product_id:  editing.product_id,
        supplier_id: editing.supplier_id,
        price:       editing.price,
        currency:    editing.currency as 'USD' | 'EUR' | 'TRY',
        price_date:  editing.price_date,
        valid_until: editing.valid_until ?? '',
        notes:       editing.notes ?? '',
      });
    } else if (open && !editing) {
      reset({
        product_id: '', supplier_id: '', price: '' as unknown as number,
        currency: 'USD', price_date: new Date().toISOString().slice(0, 10),
        valid_until: '', notes: '',
      });
    }
  });

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(prodSearch.toLowerCase())
  );
  const filteredSuppliers = suppliers.filter(s =>
    s.name.toLowerCase().includes(supSearch.toLowerCase())
  );

  async function handleAddProduct() {
    if (!newProdName.trim()) return;
    const p = await createProduct.mutateAsync({ name: newProdName.trim(), hs_code: '', unit: 'ADMT', description: '', origin_country: '', species: '', grade: '', category_id: null });
    setValue('product_id', p.id);
    setAddingProd(false);
    setNewProdName('');
    setProdOpen(false);
  }

  async function handleAddSupplier() {
    if (!newSupName.trim()) return;
    const s = await createSupplier.mutateAsync({ name: newSupName.trim(), country: '', city: '', address: '', contact_name: '', phone: '', email: '', tax_id: '', website: '', payment_terms: '', swift_code: '', iban: '', notes: '' });
    setValue('supplier_id', s.id);
    setAddingSup(false);
    setNewSupName('');
    setSupOpen(false);
  }

  async function onSubmit(data: PriceListFormData) {
    if (editing) {
      await updateEntry.mutateAsync({ id: editing.id, data });
    } else {
      await createEntry.mutateAsync(data);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag className="h-4 w-4 text-gray-500" />
            {editing ? t('modal.titleEdit') : t('modal.titleNew')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">

          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.product')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setProdOpen(!prodOpen); setSupOpen(false); }}
                className="w-full h-9 px-3 text-left text-sm border border-gray-200 rounded-xl bg-white flex items-center justify-between hover:border-gray-300 transition-colors"
              >
                <span className={selectedProduct ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedProduct?.name ?? t('modal.selectProduct')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {prodOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        autoFocus
                        value={prodSearch}
                        onChange={e => setProdSearch(e.target.value)}
                        placeholder={t('modal.searchProducts')}
                        className="w-full pl-8 pr-3 h-7 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {filteredProducts.map(p => (
                      <button
                        key={p.id} type="button"
                        onClick={() => { setValue('product_id', p.id); setProdOpen(false); setProdSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      >
                        {p.name}
                      </button>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">{t('modal.noProducts')}</div>
                    )}
                  </div>
                  <div className="border-t border-gray-100 p-2">
                    {addingProd ? (
                      <div className="flex gap-1.5">
                        <input
                          autoFocus
                          value={newProdName}
                          onChange={e => setNewProdName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddProduct())}
                          placeholder={t('modal.productNamePlaceholder')}
                          className="flex-1 h-7 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                        <button type="button" onClick={handleAddProduct} className="px-2.5 h-7 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">{t('modal.btnAdd')}</button>
                        <button type="button" onClick={() => setAddingProd(false)} className="px-2 h-7 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAddingProd(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-1 py-0.5">
                        <Plus className="h-3 w-3" /> {t('modal.addNewProduct')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {errors.product_id && <p className="text-xs text-red-500 mt-1">{errors.product_id.message}</p>}
          </div>

          {/* Supplier */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.supplier')}</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setSupOpen(!supOpen); setProdOpen(false); }}
                className="w-full h-9 px-3 text-left text-sm border border-gray-200 rounded-xl bg-white flex items-center justify-between hover:border-gray-300 transition-colors"
              >
                <span className={selectedSupplier ? 'text-gray-900' : 'text-gray-400'}>
                  {selectedSupplier?.name ?? t('modal.selectSupplier')}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
              </button>
              {supOpen && (
                <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        autoFocus
                        value={supSearch}
                        onChange={e => setSupSearch(e.target.value)}
                        placeholder={t('modal.searchSuppliers')}
                        className="w-full pl-8 pr-3 h-7 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                      />
                    </div>
                  </div>
                  <div className="max-h-44 overflow-y-auto">
                    {filteredSuppliers.map(s => (
                      <button
                        key={s.id} type="button"
                        onClick={() => { setValue('supplier_id', s.id); setSupOpen(false); setSupSearch(''); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
                      >
                        {s.name}
                      </button>
                    ))}
                    {filteredSuppliers.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">{t('modal.noSuppliers')}</div>
                    )}
                  </div>
                  <div className="border-t border-gray-100 p-2">
                    {addingSup ? (
                      <div className="flex gap-1.5">
                        <input
                          autoFocus
                          value={newSupName}
                          onChange={e => setNewSupName(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddSupplier())}
                          placeholder={t('modal.supplierNamePlaceholder')}
                          className="flex-1 h-7 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-300"
                        />
                        <button type="button" onClick={handleAddSupplier} className="px-2.5 h-7 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700">{t('modal.btnAdd')}</button>
                        <button type="button" onClick={() => setAddingSup(false)} className="px-2 h-7 text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setAddingSup(true)} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 px-1 py-0.5">
                        <Plus className="h-3 w-3" /> {t('modal.addNewSupplier')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
            {errors.supplier_id && <p className="text-xs text-red-500 mt-1">{errors.supplier_id.message}</p>}
          </div>

          {/* Price + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.price')}</label>
              <input
                {...register('price')}
                type="number" step="0.0001" min="0"
                placeholder="0.00"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200"
              />
              {errors.price && <p className="text-xs text-red-500 mt-1">{errors.price.message}</p>}
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.currency')}</label>
              <select
                {...register('currency')}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.priceDate')}</label>
              <MonoDatePicker value={watch('price_date') ?? ''} onChange={v => setValue('price_date', v)} className="w-full h-9 bg-white border border-gray-200 rounded-xl px-3 text-[13px] text-gray-900 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-50 transition-colors" />
              {errors.price_date && <p className="text-xs text-red-500 mt-1">{errors.price_date.message}</p>}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.validUntil')}</label>
              <MonoDatePicker value={watch('valid_until') ?? ''} onChange={v => setValue('valid_until', v)} className="w-full h-9 bg-white border border-gray-200 rounded-xl px-3 text-[13px] text-gray-900 focus:outline-none flex items-center justify-between overflow-hidden hover:bg-gray-50 transition-colors" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('modal.notes')}</label>
            <textarea
              {...register('notes')}
              rows={2}
              placeholder={t('modal.notesPlaceholder')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="px-4 h-9 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              {tc('btn.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 h-9 text-sm font-semibold text-white bg-gray-900 rounded-xl hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? t('modal.btnSaving') : editing ? t('modal.btnUpdate') : t('modal.btnSave')}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Price History Modal ──────────────────────────────────────────────────────

interface HistoryModalProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialProductId?: string;
}

// Generate distinct colors for chart lines
const LINE_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#4f46e5',
];

function PriceHistoryModal({ open, onOpenChange, initialProductId = '' }: HistoryModalProps) {
  const { t } = useTranslation('priceList');
  const { t: tc } = useTranslation('common');

  const { data: products = [] } = useProducts();
  const [selectedProductId, setSelectedProductId] = useState(initialProductId);
  const { data: history = [], isLoading } = usePriceListByProduct(selectedProductId);

  // Build chart data: one point per date, one series per supplier
  const { chartData, supplierNames } = useMemo(() => {
    if (!history.length) return { chartData: [], supplierNames: [] };

    const supplierMap = new Map<string, string>();
    history.forEach(e => {
      if (e.supplier?.name) supplierMap.set(e.supplier_id, e.supplier.name);
    });
    const supplierNames = Array.from(supplierMap.values());

    // Group by date
    const byDate = new Map<string, Record<string, number>>();
    history.forEach(e => {
      if (!byDate.has(e.price_date)) byDate.set(e.price_date, {});
      const supName = supplierMap.get(e.supplier_id) ?? e.supplier_id;
      byDate.get(e.price_date)![supName] = e.price;
    });

    const chartData = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({ date: fDate(date), ...prices }));

    return { chartData, supplierNames };
  }, [history]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-gray-500" />
            {t('history.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Product selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{t('history.product')}</label>
            <select
              value={selectedProductId}
              onChange={e => setSelectedProductId(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 bg-white"
            >
              <option value="">{t('history.selectProduct')}</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {!selectedProductId && (
            <div className="py-8 text-center text-sm text-gray-400">
              {t('history.noProductSelected')}
            </div>
          )}

          {selectedProductId && isLoading && (
            <div className="py-8 text-center text-sm text-gray-400">{tc('btn.loading')}</div>
          )}

          {selectedProductId && !isLoading && history.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400">
              {t('history.noPrices')}
            </div>
          )}

          {selectedProductId && !isLoading && history.length > 0 && (
            <>
              {/* Chart */}
              {chartData.length > 1 && (
                <div className="bg-gray-50 rounded-2xl p-4">
                  <p className="text-xs font-semibold text-gray-500 mb-3">{t('history.priceTrend')}</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {supplierNames.map((name, i) => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={LINE_COLORS[i % LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* History table */}
              <div className="border border-gray-100 rounded-2xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{t('history.colDate')}</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{t('history.colSupplier')}</th>
                      <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">{t('history.colPrice')}</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{t('history.colValidUntil')}</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">{t('history.colNotes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((entry, i) => (
                      <tr key={entry.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                        <td className="px-4 py-2.5 text-xs text-gray-700 whitespace-nowrap">{fDate(entry.price_date)}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-700">{entry.supplier?.name ?? '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-semibold text-gray-900 text-right whitespace-nowrap">
                          {CURRENCY_SYMBOLS[entry.currency] ?? ''}{entry.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {entry.currency}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{fDate(entry.valid_until ?? '')}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[160px] truncate">{entry.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="pt-2">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 h-9 text-sm font-medium text-gray-600 hover:text-gray-900 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            {tc('btn.close')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function PriceListPage() {
  const { t } = useTranslation('priceList');
  const { t: tc } = useTranslation('common');

  const { profile } = useAuth();
  const { theme } = useTheme();
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const canWrite = profile?.role === 'admin' || profile?.role === 'manager';

  const { data: entries = [], isLoading } = usePriceList();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const deleteEntry = useDeletePriceList();

  const [search, setSearch] = useState('');
  const [filterProductId, setFilterProductId] = useState('');
  const [filterSupplierId, setFilterSupplierId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PriceList | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyProductId, setHistoryProductId] = useState('');
  const [pricePage, setPricePage] = useState(1);

  // AI Analiz state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiError, setAiError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const abortRef = useRef(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter(e => {
      const matchSearch = !q ||
        (e.product?.name ?? '').toLowerCase().includes(q) ||
        (e.supplier?.name ?? '').toLowerCase().includes(q) ||
        (e.notes ?? '').toLowerCase().includes(q);
      const matchProduct = !filterProductId || e.product_id === filterProductId;
      const matchSupplier = !filterSupplierId || e.supplier_id === filterSupplierId;
      return matchSearch && matchProduct && matchSupplier;
    });
  }, [entries, search, filterProductId, filterSupplierId]);

  const priceTotalPages = Math.max(1, Math.ceil(filtered.length / PRICE_PAGE_SIZE));
  const priceCurrentPage = Math.min(pricePage, priceTotalPages);
  const pagedEntries = filtered.slice((priceCurrentPage - 1) * PRICE_PAGE_SIZE, priceCurrentPage * PRICE_PAGE_SIZE);

  // Filtre değişince ilk sayfaya dön
  const resetPricePage = () => setPricePage(1);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(e: PriceList) { setEditing(e); setModalOpen(true); }
  function handleDelete(e: PriceList) {
    if (!window.confirm(t('confirm.delete', { product: e.product?.name ?? '' }))) return;
    deleteEntry.mutate(e.id);
  }
  function openHistory(productId = '') { setHistoryProductId(productId); setHistoryOpen(true); }
  function isExpired(entry: PriceList) {
    if (!entry.valid_until) return false;
    return new Date(entry.valid_until) < new Date();
  }

  async function handleAiAnalysis() {
    if (aiLoading) { abortRef.current = true; return; }
    setAiOpen(true);
    setAiText('');
    setAiError('');
    setAiLoading(true);
    abortRef.current = false;
    try {
      const gen = streamPriceListAnalysis(entries);
      for await (const chunk of gen) {
        if (abortRef.current) break;
        setAiText(prev => prev + chunk);
      }
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          MOBILE
      ══════════════════════════════════════════════════════════════ */}
      <div className="md:hidden flex flex-col min-h-screen -mx-4 bg-gray-50">

        {/* Mobile header */}
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>
              Fiyat Listesi
            </div>
            <h2 className="text-[22px] font-extrabold text-gray-900 leading-tight tracking-tight">
              {filtered.length} <span className="text-gray-400 font-medium text-[16px]">kayıt</span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openHistory()}
              className="w-9 h-9 rounded-full bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-500"
            >
              <History className="h-4 w-4" />
            </button>
            {canWrite && (
              <button
                onClick={openNew}
                className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow"
                style={{ background: accent }}
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile search */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-white rounded-full px-4 h-10 shadow-sm border border-gray-100">
            <Search className="h-4 w-4 text-gray-400 shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPricePage(); }}
              placeholder={t('search')}
              className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* Mobile list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Tag className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm font-medium text-gray-500">{t('empty.title')}</p>
          </div>
        ) : (
          <div className="mx-3 rounded-2xl overflow-hidden shadow-sm bg-white divide-y divide-gray-50">
            {pagedEntries.map((entry) => {
              const expired = isExpired(entry);
              const supplierAny = entry.supplier as { name?: string; logo_url?: string | null } | null;
              return (
                <div key={entry.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <EntityAvatar
                      name={supplierAny?.name ?? '?'}
                      logoUrl={supplierAny?.logo_url}
                      size="sm"
                      shape="square"
                    />
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => openHistory(entry.product_id)}
                        className="text-[13px] font-semibold text-gray-900 truncate text-left w-full"
                      >
                        {entry.product?.name ?? '—'}
                      </button>
                      <div className="text-[11px] text-gray-400 truncate">{supplierAny?.name ?? '—'}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[15px] font-extrabold text-gray-900">
                        {CURRENCY_SYMBOLS[entry.currency] ?? ''}{entry.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        <span className="text-[10px] font-semibold text-gray-400 ml-1">{entry.currency}</span>
                      </div>
                      {entry.valid_until && (
                        <span className={`text-[10px] font-semibold ${expired ? 'text-red-500' : 'text-green-600'}`}>
                          {expired ? 'Süresi doldu' : fDate(entry.valid_until)}
                        </span>
                      )}
                    </div>
                  </div>
                  {entry.notes && (
                    <div className="text-[11px] text-gray-400 mt-1.5 pl-11 truncate">{entry.notes}</div>
                  )}
                  {canWrite && (
                    <div className="flex gap-3 mt-2 pl-11">
                      <button onClick={() => openEdit(entry)} className="text-[11px] text-gray-400 hover:text-gray-700 flex items-center gap-1">
                        <Pencil className="h-3 w-3" /> {tc('btn.edit')}
                      </button>
                      <button onClick={() => handleDelete(entry)} className="text-[11px] text-gray-400 hover:text-red-500 flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> {tc('btn.delete')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          DESKTOP
      ══════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block md:-mt-6 md:-mx-6 min-h-screen" style={{ background: '#EFEDE8', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
       <div className="px-8 pt-7 pb-8 flex flex-col h-full">

        {/* Satır 1: Başlık + Ana Aksiyon */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex items-center justify-center">
              <Tag style={{ width: 20, height: 20 }} className="text-[#8A8A8E]" />
            </div>
            <div>
              <h1 className="text-[22px] font-bold text-[#0A0A0A] tracking-[-0.02em] leading-tight">Fiyat Listesi</h1>
              <p className="text-[13px] text-[#8A8A8E] mt-0.5">Ürün ve tedarikçi fiyat geçmişi</p>
            </div>
          </div>
          <div className="flex-1" />
          {canWrite && (
            <button
              onClick={openNew}
              className="h-10 px-5 rounded-full text-white text-[13px] font-semibold transition-colors flex items-center gap-1.5 shrink-0 whitespace-nowrap shadow-[0_8px_24px_rgba(0,0,0,0.04)]"
              style={{ background: accent }}
              onMouseEnter={e => { e.currentTarget.style.background = `color-mix(in srgb, ${accent} 88%, #000)`; }}
              onMouseLeave={e => { e.currentTarget.style.background = accent; }}
            >
              <Plus className="h-4 w-4 shrink-0" />
              {t('btnNew')}
            </button>
          )}
        </div>

        {/* Satır 2: Arama + Filtreler + Diğer Butonlar */}
        <div className="flex items-center gap-2 mb-5">
          {/* Arama */}
          <div className="flex items-center gap-2 bg-white rounded-full px-4 h-10 border border-[#ECECEC] w-52">
            <Search className="h-4 w-4 text-[#A8A8AD] shrink-0" />
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); resetPricePage(); }}
              placeholder={t('search')}
              className="flex-1 text-[13px] text-[#0A0A0A] outline-none bg-transparent placeholder:text-[#A8A8AD]"
            />
          </div>

          {/* Filtre — Ürün */}
          <select
            value={filterProductId}
            onChange={e => { setFilterProductId(e.target.value); resetPricePage(); }}
            className="h-10 w-44 shrink-0 px-4 pr-9 text-[12px] bg-white border border-[#ECECEC] rounded-full text-[#6F6F6F] focus:outline-none appearance-none cursor-pointer truncate"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23A8A8AD' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
          >
            <option value="">{t('allProducts')}</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {/* Filtre — Tedarikçi */}
          <select
            value={filterSupplierId}
            onChange={e => { setFilterSupplierId(e.target.value); resetPricePage(); }}
            className="h-10 w-44 shrink-0 px-4 pr-9 text-[12px] bg-white border border-[#ECECEC] rounded-full text-[#6F6F6F] focus:outline-none appearance-none cursor-pointer truncate"
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23A8A8AD' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
          >
            <option value="">{t('allSuppliers')}</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex-1" />

          {/* Fiyat Geçmişi butonu */}
          <button
            onClick={() => openHistory()}
            className="h-10 px-4 rounded-full text-[13px] font-semibold text-[#0A0A0A] bg-white border border-[#ECECEC] flex items-center gap-1.5 hover:bg-[#FAF9F6] transition-colors shrink-0 whitespace-nowrap"
          >
            <TrendingUp className="h-4 w-4 text-[#A8A8AD] shrink-0" />
            {t('btnPriceHistory')}
          </button>

          {/* AI Analizi butonu */}
          <button
            onClick={handleAiAnalysis}
            disabled={isLoading}
            className="h-10 px-4 rounded-full text-[13px] font-semibold flex items-center gap-1.5 shrink-0 whitespace-nowrap border transition-all"
            style={aiOpen
              ? { background: '#6B4EE6', color: '#fff', borderColor: '#6B4EE6' }
              : { background: '#fff', color: '#6B4EE6', borderColor: '#6B4EE6' + '33' }
            }
          >
            {aiLoading
              ? <><div className="w-3.5 h-3.5 border-2 border-[#6B4EE6]/30 border-t-[#6B4EE6] rounded-full animate-spin shrink-0" />Analiz ediliyor…</>
              : <><Sparkles className="h-4 w-4 shrink-0" />AI Analizi</>
            }
          </button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: accent }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#A8A8AD]">
            <Tag className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm font-medium text-[#8A8A8E]">{t('empty.title')}</p>
            <p className="text-xs mt-1">{entries.length > 0 ? t('empty.adjustFilters') : t('empty.addFirst')}</p>
          </div>
        ) : (
          <div className="bg-white rounded-[20px] border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#F4F2EE]">
                  <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.product')}</th>
                  <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.supplier')}</th>
                  <th className="px-4 py-3.5 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.price')}</th>
                  <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.priceDate')}</th>
                  <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.validUntil')}</th>
                  <th className="px-4 py-3.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[#A8A8AD]">{t('table.notes')}</th>
                  {canWrite && <th className="w-20 px-4 py-3.5" />}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => {
                  const expired = isExpired(entry);
                  const supplierAny = entry.supplier as { name?: string; logo_url?: string | null } | null;
                  return (
                    <tr
                      key={entry.id}
                      className={`border-b border-[#F4F2EE] hover:bg-[#FAF9F6] transition-colors ${i % 2 === 1 ? 'bg-[#FBFAF8]' : ''}`}
                    >
                      {/* Product */}
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => openHistory(entry.product_id)}
                          className="text-[13px] font-semibold text-[#0A0A0A] hover:underline text-left flex items-center gap-1.5"
                        >
                          {entry.product?.name ?? '—'}
                        </button>
                      </td>

                      {/* Supplier with avatar */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <EntityAvatar
                            name={supplierAny?.name ?? '?'}
                            logoUrl={supplierAny?.logo_url}
                            size="xs"
                            shape="square"
                          />
                          <span className="text-[12px] text-[#6F6F6F] truncate max-w-[200px]">
                            {supplierAny?.name ?? '—'}
                          </span>
                        </div>
                      </td>

                      {/* Price */}
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <span className="text-[13px] font-bold text-[#0A0A0A] tabular-nums">
                          {CURRENCY_SYMBOLS[entry.currency] ?? ''}{entry.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                        </span>
                        <span className="text-[10px] text-[#A8A8AD] ml-1">{entry.currency}</span>
                      </td>

                      {/* Price date */}
                      <td className="px-4 py-3.5 text-[12px] text-[#8A8A8E] whitespace-nowrap">{fDate(entry.price_date)}</td>

                      {/* Valid until */}
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {entry.valid_until ? (
                          <span className={`text-[10px] font-semibold px-2 py-1 rounded-full ${
                            expired ? 'bg-[#EF4444]/10 text-[#EF4444]' : 'bg-[#16A34A]/10 text-[#16A34A]'
                          }`}>
                            {fDate(entry.valid_until)}
                          </span>
                        ) : (
                          <span className="text-[12px] text-[#D8D4CC]">—</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="px-4 py-3.5 text-[11px] text-[#A8A8AD] max-w-[180px] truncate">
                        {entry.notes || '—'}
                      </td>

                      {/* Actions */}
                      {canWrite && (
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => openEdit(entry)}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-[#A8A8AD] hover:text-[#0A0A0A] hover:bg-[#F4F2EE] transition-colors"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(entry)}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-[#A8A8AD] hover:text-[#EF4444] hover:bg-[#EF4444]/8 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {priceTotalPages > 1 && (
              <div className="flex items-center justify-center gap-1.5 py-4 border-t border-[#F4F2EE]">
                {Array.from({ length: priceTotalPages }, (_, i) => i + 1).map(p => (
                  <button
                    key={p}
                    onClick={() => setPricePage(p)}
                    className={`w-8 h-8 rounded-full text-[11px] font-bold transition-all ${
                      p === priceCurrentPage ? 'text-white' : 'bg-[#F4F2EE] text-[#8A8A8E] hover:bg-[#EAE7E0]'
                    }`}
                    style={p === priceCurrentPage ? { background: accent } : {}}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
       </div>
      </div>

      {/* Modals */}
      <PriceEntryModal open={modalOpen} onOpenChange={setModalOpen} editing={editing} />
      <PriceHistoryModal open={historyOpen} onOpenChange={setHistoryOpen} initialProductId={historyProductId} />

      {/* AI Analiz Popup */}
      <Dialog open={aiOpen} onOpenChange={open => { if (!open) { abortRef.current = true; setAiOpen(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-100 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-[14px] font-bold text-gray-900">AI Fiyat Analizi</h2>
                <p className="text-[11px] text-gray-400">{entries.length} fiyat kaydı · {new Set(entries.map(e => e.product_id)).size} ürün</p>
              </div>
              {aiLoading && (
                <div className="w-3.5 h-3.5 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin ml-1" />
              )}
            </div>
          </div>

          {/* Body — scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-[200px]">
            {aiError ? (
              <div className="flex items-start gap-2 text-red-500 text-[12px] bg-red-50 px-3 py-2.5 rounded-xl">
                <span>⚠️</span>
                <span>{aiError}</span>
              </div>
            ) : aiText ? (
              <div className="space-y-1.5">
                {aiText.split('\n').map((line, i) => {
                  if (line.startsWith('## '))
                    return <h3 key={i} className="text-[14px] font-bold text-gray-900 mt-5 first:mt-0 flex items-center gap-2">
                      <span className="w-1 h-4 rounded-full bg-purple-400 shrink-0" />
                      {line.slice(3)}
                    </h3>;
                  if (line.startsWith('### '))
                    return <h4 key={i} className="text-[12px] font-bold text-gray-700 mt-3 ml-3">{line.slice(4)}</h4>;
                  if (line.startsWith('- ') || line.startsWith('* '))
                    return (
                      <div key={i} className="flex gap-2 text-[12px] text-gray-600 ml-3">
                        <span className="text-purple-300 shrink-0 mt-0.5">•</span>
                        <span dangerouslySetInnerHTML={{ __html: line.slice(2).replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-800">$1</strong>') }} />
                      </div>
                    );
                  if (line.trim() === '') return <div key={i} className="h-1.5" />;
                  return (
                    <p key={i} className="text-[12px] text-gray-600 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-800">$1</strong>') }}
                    />
                  );
                })}
                {aiLoading && (
                  <span className="inline-block w-1.5 h-4 bg-purple-400 animate-pulse rounded-sm ml-1 align-middle" />
                )}
              </div>
            ) : aiLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-500 rounded-full animate-spin" />
                <p className="text-[12px]">Fiyat listesi analiz ediliyor…</p>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          {!aiLoading && aiText && (
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
              <p className="text-[10px] text-gray-400">Claude Haiku · Sonuçlar bilgi amaçlıdır</p>
              <button
                onClick={handleAiAnalysis}
                className="flex items-center gap-1.5 text-[11px] font-semibold text-purple-600 hover:text-purple-800 transition-colors"
              >
                <Sparkles className="h-3 w-3" />
                Yeniden Analiz Et
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
