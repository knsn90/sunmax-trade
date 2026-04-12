import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, type ProductFormData, type ProductCategoryFormData } from '@/types/forms';
import type { Product, ProductCategory } from '@/types/database';
import {
  useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct,
  useProductCategories, useCreateProductCategory, useUpdateProductCategory, useDeleteProductCategory,
} from '@/hooks/useEntities';
import { useAuth } from '@/hooks/useAuth';
import { canWrite, isAdmin } from '@/lib/permissions';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { LoadingSpinner } from '@/components/ui/shared';
import { AIFormFill } from '@/components/ui/AIFormFill';
import { Search, Pencil, Trash2, Plus, Tag, Check } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const CATEGORY_COLORS = [
  '#6b7280', '#3b82f6', '#0ea5e9', '#8b5cf6',
  '#10b981', '#f59e0b', '#ef4444', '#ec4899',
];

// ─── Category Badge ────────────────────────────────────────────────────────────
function CategoryBadge({ category, size = 'sm' }: { category: ProductCategory; size?: 'sm' | 'xs' }) {
  const cls = size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[10px]';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${cls}`}
      style={{ background: category.color + '20', color: category.color }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: category.color }} />
      {category.name}
    </span>
  );
}

// ─── Manage Categories Modal ────────────────────────────────────────────────────
function ManageCategoriesModal({ open, onOpenChange, accent }: {
  open: boolean; onOpenChange: (v: boolean) => void; accent: string;
}) {
  const { t } = useTranslation('products');
  const { t: tc } = useTranslation('common');
  const { data: categories = [] } = useProductCategories();
  const createCat = useCreateProductCategory();
  const updateCat = useUpdateProductCategory();
  const deleteCat = useDeleteProductCategory();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[1]);

  async function handleAdd() {
    if (!newName.trim()) return;
    await createCat.mutateAsync({ name: newName.trim(), color: newColor });
    setNewName('');
    setNewColor(CATEGORY_COLORS[1]);
  }

  async function handleUpdate(cat: ProductCategory, field: Partial<ProductCategoryFormData>) {
    await updateCat.mutateAsync({ id: cat.id, data: { name: cat.name, color: cat.color, ...field } });
    setEditingId(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('manageCategories')}</DialogTitle></DialogHeader>

        {/* Existing categories */}
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {categories.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">{t('noCategories')}</p>
          )}
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-gray-50">
              {/* Color dot / picker */}
              <div className="relative group">
                <span className="w-5 h-5 rounded-full block cursor-pointer border-2 border-white shadow"
                  style={{ background: cat.color }} />
              </div>
              {editingId === cat.id ? (
                <input
                  autoFocus
                  defaultValue={cat.name}
                  onBlur={e => handleUpdate(cat, { name: e.target.value })}
                  onKeyDown={e => { if (e.key === 'Enter') handleUpdate(cat, { name: (e.target as HTMLInputElement).value }); if (e.key === 'Escape') setEditingId(null); }}
                  className="flex-1 text-sm border-b border-blue-400 outline-none bg-transparent"
                />
              ) : (
                <span className="flex-1 text-sm font-medium text-gray-800 cursor-pointer" onClick={() => setEditingId(cat.id)}>
                  {cat.name}
                </span>
              )}
              {/* Color picker row */}
              <div className="flex gap-1">
                {CATEGORY_COLORS.slice(0, 4).map(c => (
                  <button key={c} onClick={() => handleUpdate(cat, { color: c })}
                    className="w-4 h-4 rounded-full border-2 transition-all"
                    style={{ background: c, borderColor: cat.color === c ? '#1f2937' : 'transparent' }} />
                ))}
              </div>
              <button onClick={() => { if (window.confirm(t('confirm.deleteCategory', { name: cat.name }))) deleteCat.mutate(cat.id); }}
                className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="border-t border-gray-100 pt-3 mt-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">{t('newCategory')}</p>
          <div className="flex gap-2 items-center">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              placeholder={t('categoryNamePlaceholder')}
              className="flex-1 h-8 px-2.5 rounded-lg border border-gray-200 text-sm outline-none focus:border-blue-400 transition"
            />
            <div className="flex gap-1">
              {CATEGORY_COLORS.map(c => (
                <button key={c} onClick={() => setNewColor(c)}
                  className="w-5 h-5 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: newColor === c ? '#1f2937' : 'transparent' }} />
              ))}
            </div>
            <button onClick={handleAdd} disabled={!newName.trim() || createCat.isPending}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-40"
              style={{ background: accent }}>
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="px-4 h-9 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
            {tc('btn.close')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCTS PAGE
// ═══════════════════════════════════════════════════════════════════════════
export function ProductsPage() {
  const { t } = useTranslation('products');
  const { t: tc } = useTranslation('common');
  const { profile } = useAuth();
  const { accent } = useTheme();
  const writable = canWrite(profile?.role);
  const adminRole = isAdmin(profile?.role);
  const { data: products = [], isLoading } = useProducts();
  const { data: categories = [] } = useProductCategories();
  const createP = useCreateProduct();
  const updateP = useUpdateProduct();
  const deleteP = useDeleteProduct();
  const [modalOpen, setModalOpen] = useState(false);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [search, setSearch] = useState('');
  const [filterCatId, setFilterCatId] = useState<string | null>(null);

  const tableHeaders = [
    t('table.code'),
    t('table.name'),
    t('table.category'),
    t('table.unit'),
    t('table.hsCode'),
    t('table.originSpecies'),
    t('table.grade'),
    tc('table.actions'),
  ];

  const EMPTY: ProductFormData = {
    name: '', hs_code: '', unit: 'ADMT',
    description: '', origin_country: '', species: '', grade: '',
    category_id: null,
  };

  const form = useForm<ProductFormData>({ resolver: zodResolver(productSchema), defaultValues: EMPTY });
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = form;
  const selectedCatId = watch('category_id');

  const filtered = products.filter(p => {
    const matchSearch = !search.trim() || (
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.code?.toLowerCase().includes(search.toLowerCase()) ||
      p.species?.toLowerCase().includes(search.toLowerCase())
    );
    const matchCat = !filterCatId || p.category_id === filterCatId;
    return matchSearch && matchCat;
  });

  function openNew() { setEditing(null); reset(EMPTY); setModalOpen(true); }
  function openEdit(p: Product) {
    setEditing(p);
    reset({
      name: p.name, hs_code: p.hs_code, unit: p.unit,
      description: p.description ?? '',
      origin_country: p.origin_country ?? '',
      species: p.species ?? '',
      grade: p.grade ?? '',
      category_id: p.category_id ?? null,
    });
    setModalOpen(true);
  }
  async function onSubmit(data: ProductFormData) {
    if (editing) await updateP.mutateAsync({ id: editing.id, data });
    else await createP.mutateAsync(data);
    setModalOpen(false);
  }

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="-mx-4 md:mx-0">
      <div className="px-4 md:px-0">

        {/* Toolbar — search + categories + buttons all on one row */}
        <div className="flex items-center gap-2 mb-4">
          {/* Search — fixed small width */}
          <div className="relative w-36 md:w-48 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('search')}
              className="w-full pl-7 pr-2 h-8 rounded-xl border border-gray-200 bg-white text-[12px] text-gray-800 placeholder:text-gray-400 outline-none focus:border-blue-400 transition" />
          </div>

          {/* Category filter pills */}
          {categories.length > 0 && (
            <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl flex-1 overflow-x-auto scrollbar-none min-w-0">
              <button
                onClick={() => setFilterCatId(null)}
                className={`shrink-0 px-3 h-6 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                  !filterCatId ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tc('all')}
              </button>
              {categories.map(cat => (
                <button key={cat.id}
                  onClick={() => setFilterCatId(filterCatId === cat.id ? null : cat.id)}
                  className={`shrink-0 px-3 h-6 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap ${
                    filterCatId === cat.id ? 'bg-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={filterCatId === cat.id ? { color: cat.color } : {}}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          )}

          {/* Icon buttons */}
          <button onClick={() => setCatModalOpen(true)} title={t('manageCategoriesTooltip')}
            className="w-8 h-8 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors shrink-0">
            <Tag className="h-3.5 w-3.5" />
          </button>
          {writable && (
            <button onClick={openNew} className="w-8 h-8 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ background: accent }}>
              <Plus className="h-3.5 w-3.5 text-white" />
            </button>
          )}
        </div>

        {/* Mobile cards */}
        <div className="md:hidden space-y-2">
          {filtered.length === 0 ? (
            <div className="py-14 text-center text-sm text-gray-400">{search ? t('noResults') : t('noProducts')}</div>
          ) : filtered.map(p => (
            <div key={p.id} className="bg-white rounded-2xl shadow-sm px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-bold text-sm"
                style={{ background: (p.category as ProductCategory)?.color ? (p.category as ProductCategory).color + '18' : accent + '18', color: (p.category as ProductCategory)?.color ?? accent }}>
                {p.code?.slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-bold text-gray-900 truncate">{p.name}</span>
                  <span className="text-[10px] font-semibold text-gray-400">{p.unit}</span>
                  {p.category && <CategoryBadge category={p.category as ProductCategory} size="xs" />}
                </div>
                {p.species && <div className="text-xs text-gray-500 truncate">{p.species}{p.grade ? ` · ${p.grade}` : ''}</div>}
                {(p.hs_code || p.origin_country) && (
                  <div className="text-xs text-gray-400 truncate">
                    {[p.hs_code && `HS: ${p.hs_code}`, p.origin_country].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {writable && <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>}
                {adminRole && <button onClick={() => { if (window.confirm(t('confirm.removeProduct'))) deleteP.mutate(p.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full table-fixed">
            <colgroup>
              <col style={{ width: '7%' }} /><col style={{ width: '22%' }} /><col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} /><col style={{ width: '12%' }} /><col style={{ width: '16%' }} /><col style={{ width: '11%' }} /><col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100">
                {tableHeaders.map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="py-14 text-center text-sm text-gray-400">{search ? t('noResults') : t('noProducts')}</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3 text-xs font-bold text-gray-400">{p.code}</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 truncate">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.category
                      ? <CategoryBadge category={p.category as ProductCategory} />
                      : <span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.unit}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.hs_code || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 truncate">{[p.origin_country, p.species].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{p.grade || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-nowrap">
                      {writable && <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>}
                      {adminRole && <button onClick={() => { if (window.confirm(t('confirm.removeProduct'))) deleteP.mutate(p.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Product Modal — Mono tasarım */}
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="max-w-lg !p-0 overflow-hidden">
            {/* Başlık */}
            <div className="px-6 pt-6 pb-4 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                {editing ? t('modal.editProduct') : t('modal.newProduct')}
              </p>
              <h2 className="text-[18px] font-extrabold text-gray-900 leading-tight">
                {editing ? editing.name : t('modal.newProduct')}
              </h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">

                {/* AI Fill */}
                <AIFormFill
                  formType="new_product"
                  onFill={(fields) => reset({ ...form.getValues(), ...(fields as Partial<ProductFormData>) })}
                  placeholder={t('modal.aiPlaceholder')}
                />

                {/* Bölüm: Temel Bilgiler */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Temel Bilgiler</p>
                  <div className="grid grid-cols-[1fr_100px] gap-3">
                    <div>
                      <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('modal.productName')} *</label>
                      <input
                        {...register('name')}
                        className="w-full h-9 px-3 rounded-xl bg-gray-50 border border-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-300 transition"
                      />
                      {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name.message}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('modal.unit')}</label>
                      <select
                        {...register('unit')}
                        className="w-full h-9 px-3 rounded-xl bg-gray-50 border border-gray-100 text-[13px] text-gray-900 focus:outline-none focus:bg-white focus:border-gray-300 transition appearance-none"
                      >
                        <option value="ADMT">ADMT</option>
                        <option value="MT">MT</option>
                        <option value="KG">KG</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Bölüm: Kategori */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{t('modal.category')}</p>
                    <button type="button" onClick={() => { setModalOpen(false); setCatModalOpen(true); }}
                      className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                      <Plus className="h-3 w-3" /> {tc('btn.new')}
                    </button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <button type="button"
                      onClick={() => setValue('category_id', null)}
                      className={`px-3 h-7 rounded-lg text-[11px] font-semibold border transition-all ${
                        !selectedCatId
                          ? 'bg-gray-900 border-gray-900 text-white'
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}>
                      —
                    </button>
                    {categories.map(cat => (
                      <button key={cat.id} type="button"
                        onClick={() => setValue('category_id', cat.id)}
                        className={`px-3 h-7 rounded-lg text-[11px] font-semibold border transition-all flex items-center gap-1.5 ${
                          selectedCatId === cat.id
                            ? 'bg-gray-900 border-gray-900 text-white'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                        }`}>
                        {selectedCatId === cat.id && <Check className="h-3 w-3" />}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bölüm: Teknik Bilgiler */}
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Teknik Bilgiler</p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'hs_code',        label: t('modal.hsCode'),          placeholder: t('modal.hsCodePlaceholder') },
                      { key: 'origin_country',  label: t('modal.originCountry'),   placeholder: t('modal.originCountryPlaceholder') },
                      { key: 'species',         label: t('modal.speciesPulpType'), placeholder: t('modal.speciesPlaceholder') },
                      { key: 'grade',           label: t('modal.grade'),           placeholder: t('modal.gradePlaceholder') },
                    ].map(({ key, label, placeholder }) => (
                      <div key={key}>
                        <label className="text-[11px] font-medium text-gray-500 mb-1 block">{label}</label>
                        <input
                          {...register(key as keyof ProductFormData)}
                          placeholder={placeholder}
                          className="w-full h-9 px-3 rounded-xl bg-gray-50 border border-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-300 transition"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Açıklama */}
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">{t('modal.description')}</label>
                  <textarea
                    {...register('description')}
                    rows={2}
                    placeholder={t('modal.descriptionPlaceholder')}
                    className="w-full px-3 py-2.5 rounded-xl bg-gray-50 border border-gray-100 text-[13px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-gray-300 transition resize-none"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="text-[12px] font-semibold text-gray-400 hover:text-gray-600 transition-colors px-3 py-2 rounded-xl hover:bg-gray-100">
                  {tc('btn.cancel')}
                </button>
                <button type="submit" disabled={createP.isPending || updateP.isPending}
                  className="h-9 px-5 rounded-xl text-[13px] font-semibold text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                  style={{ background: accent }}>
                  {createP.isPending || updateP.isPending ? '...' : tc('btn.save')}
                </button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Manage Categories Modal */}
        <ManageCategoriesModal open={catModalOpen} onOpenChange={setCatModalOpen} accent={accent} />
      </div>
    </div>
  );
}

export { ReportsPage } from './ReportsPage';
