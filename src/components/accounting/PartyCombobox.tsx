import { useState, useRef, useEffect } from 'react';
import {
  useCustomers, useSuppliers, useServiceProviders,
  useCreateCustomer, useCreateSupplier, useCreateServiceProvider,
} from '@/hooks/useEntities';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/form-elements';
import { Search, Plus, ChevronDown, X } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type EntityKind = 'customer' | 'supplier' | 'service_provider';

export interface SelectedParty {
  id: string;
  name: string;
  entityType: EntityKind;
}

interface PartyOption {
  id: string;
  name: string;
  entityType: EntityKind;
}

interface PartyComboboxProps {
  value?: SelectedParty | null;
  onChange: (v: SelectedParty | null) => void;
  /** Show only a specific entity kind, or 'all' for everyone */
  filter?: EntityKind | 'all';
  placeholder?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const KIND_LABELS: Record<EntityKind, string> = {
  customer: 'Customer',
  supplier: 'Supplier',
  service_provider: 'Service Provider',
};

const KIND_COLORS: Record<EntityKind, string> = {
  customer: 'bg-blue-100 text-blue-700',
  supplier: 'bg-orange-100 text-orange-700',
  service_provider: 'bg-purple-100 text-purple-700',
};

// ─── Component ───────────────────────────────────────────────────────────────

export function PartyCombobox({
  value,
  onChange,
  filter = 'all',
  placeholder = 'Search party…',
}: PartyComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<EntityKind>(
    filter !== 'all' ? filter : 'customer',
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const { data: customers = [] } = useCustomers();
  const { data: suppliers = [] } = useSuppliers();
  const { data: serviceProviders = [] } = useServiceProviders();
  const createCustomer = useCreateCustomer();
  const createSupplier = useCreateSupplier();
  const createSP = useCreateServiceProvider();

  // ── Build merged option list ──────────────────────────────────────────────
  const allOptions: PartyOption[] = [
    ...(filter === 'all' || filter === 'customer'
      ? customers.map(c => ({ id: c.id, name: c.name, entityType: 'customer' as EntityKind }))
      : []),
    ...(filter === 'all' || filter === 'supplier' || filter === 'service_provider'
      ? suppliers.map(s => ({ id: s.id, name: s.name, entityType: 'supplier' as EntityKind }))
      : []),
    ...(filter === 'all' || filter === 'service_provider'
      ? serviceProviders.map(sp => ({ id: sp.id, name: sp.name, entityType: 'service_provider' as EntityKind }))
      : []),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const filtered = search.trim()
    ? allOptions.filter(o => o.name.toLowerCase().includes(search.toLowerCase()))
    : allOptions;

  // ── Close dropdown on outside click ──────────────────────────────────────
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setSearch('');
      }
    }
    if (open) document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  // ── Add new entity inline ─────────────────────────────────────────────────
  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;

    let created: SelectedParty;

    if (newKind === 'customer') {
      const c = await createCustomer.mutateAsync({
        name, country: '', city: '', address: '', contact_email: '', contact_phone: '',
        tax_id: '', website: '', payment_terms: '', notes: '',
      });
      created = { id: c.id, name: c.name, entityType: 'customer' };
    } else if (newKind === 'supplier') {
      const s = await createSupplier.mutateAsync({
        name, country: '', city: '', address: '', contact_name: '', phone: '', email: '',
        tax_id: '', website: '', payment_terms: '', swift_code: '', iban: '', notes: '',
      });
      created = { id: s.id, name: s.name, entityType: 'supplier' };
    } else {
      const sp = await createSP.mutateAsync({
        name, service_type: 'other', country: '', city: '', address: '', contact_name: '', phone: '', email: '', notes: '',
      });
      created = { id: sp.id, name: sp.name, entityType: 'service_provider' };
    }

    onChange(created);
    setAdding(false);
    setNewName('');
    setOpen(false);
    setSearch('');
  }

  const isSaving = createCustomer.isPending || createSupplier.isPending || createSP.isPending;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ── */}
      <div
        role="combobox"
        aria-expanded={open}
        className="flex items-center gap-1.5 w-full border border-input rounded-md px-2.5 py-1.5 text-xs cursor-pointer bg-white hover:border-brand-400 min-h-[32px] select-none"
        onClick={() => setOpen(true)}
      >
        {value ? (
          <>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${KIND_COLORS[value.entityType]}`}>
              {KIND_LABELS[value.entityType]}
            </span>
            <span className="flex-1 truncate font-medium text-foreground">{value.name}</span>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-700 ml-auto"
              onClick={e => { e.stopPropagation(); onChange(null); }}
              aria-label="Clear"
            >
              <X className="h-3 w-3" />
            </button>
          </>
        ) : (
          <>
            <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-muted-foreground">{placeholder}</span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </>
        )}
      </div>

      {/* ── Dropdown ── */}
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-border rounded-md shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded">
              <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Type to search…"
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>

          {/* Options */}
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-muted-foreground italic">No results found</div>
            ) : (
              filtered.map(opt => (
                <button
                  key={`${opt.entityType}-${opt.id}`}
                  type="button"
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-brand-50 text-xs transition-colors ${
                    value?.id === opt.id && value?.entityType === opt.entityType
                      ? 'bg-brand-50 font-semibold'
                      : ''
                  }`}
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${KIND_COLORS[opt.entityType]}`}>
                    {KIND_LABELS[opt.entityType]}
                  </span>
                  <span className="truncate">{opt.name}</span>
                </button>
              ))
            )}
          </div>

          {/* Add new */}
          <div className="border-t border-border">
            {!adding ? (
              <button
                type="button"
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-brand-600 hover:bg-brand-50 font-medium transition-colors"
                onClick={() => { setAdding(true); setSearch(''); }}
              >
                <Plus className="h-3 w-3" />
                Add new person…
              </button>
            ) : (
              <div className="p-2 space-y-1.5">
                <Input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Full name *"
                  className="h-7 text-xs"
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                  }}
                />
                {filter === 'all' && (
                  <NativeSelect
                    value={newKind}
                    onChange={e => setNewKind(e.target.value as EntityKind)}
                    className="h-7 text-xs"
                  >
                    <option value="customer">Customer</option>
                    <option value="supplier">Supplier</option>
                    <option value="service_provider">Service Provider</option>
                  </NativeSelect>
                )}
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    onClick={handleAdd}
                    disabled={!newName.trim() || isSaving}
                    className="flex-1"
                  >
                    {isSaving ? 'Saving…' : 'Add'}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => { setAdding(false); setNewName(''); }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
