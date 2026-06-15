import { supabase } from './supabase';
import type { TradeFile } from '@/types/database';
import type { TradeFileStatus } from '@/types/enums';
import type {
  NewTradeFileFormData,
  SaleConversionFormData,
  DeliveryFormData,
} from '@/types/forms';

// Minimal select for paginated list page (TradeFilesPage) — sadece gösterilen alanlar
const FILE_SELECT_PAGINATED = `
  id, file_no, file_date, status, tonnage_mt, delivered_admt, selling_price,
  eta, batch_no, parent_file_id,
  customer:customers!customer_id(id, name, code, country, logo_url),
  product:products!product_id(id, name, unit),
  creator:profiles!created_by(id, full_name)
`;

// Used for list queries — reports ve diğer genel kullanım için
// supplier join kaldırıldı (liste sayfasında kullanılmıyor), * yerine explicit colonlar
const FILE_SELECT = `
  id, file_no, file_date, status, tonnage_mt, delivered_admt, selling_price, purchase_price,
  incoterms, transport_mode, port_of_loading, port_of_discharge,
  proforma_ref, register_no, insurance_tr, eta, currency,
  purchase_currency, sale_currency, freight_cost, parent_file_id, batch_no,
  customer_id, product_id, created_at, updated_at,
  customer:customers!customer_id(id, name, code, country, logo_url),
  product:products!product_id(id, name, unit),
  creator:profiles!created_by(id, full_name)
`;

// Used for detail page — includes sub-documents + batches
// Belge alt-kayıtları TAM çekilir: print (Packing List / Invoice / Proforma)
// bu objeleri doğrudan kullanır — eksik alan → boş PDF.
const FILE_DETAIL_SELECT = `
  id, file_no, file_date, status, tonnage_mt, delivered_admt,
  selling_price, purchase_price, incoterms, transport_mode,
  port_of_loading, port_of_discharge, proforma_ref, register_no,
  insurance_tr, eta, revised_eta, delay_notes, currency,
  purchase_currency, sale_currency, freight_cost, parent_file_id,
  batch_no, customer_id, product_id, created_by, created_at,
  updated_at, deleted_at, cancel_reason, supplier_id,
  customer:customers!customer_id(id, name, code, country, address, contact_phone, logo_url, parent:customers!parent_customer_id(id, name, code, country, address, contact_phone)),
  product:products!product_id(id, name, unit, category_id),
  supplier:suppliers!supplier_id(id, name, logo_url, country),
  suppliers:trade_file_suppliers(supplier_id, supplier:suppliers!supplier_id(id, name, logo_url, country)),
  invoices(*),
  packing_lists(*, packing_list_items(*)),
  proformas(*),
  batches:trade_files!parent_file_id(id, file_no, batch_no, status, tonnage_mt, delivered_admt, supplier_id, transport_mode, eta, packing_lists(*, packing_list_items(*)), invoices(*))
`;

// Minimal select for mutations — no joins, avoids Supabase load
const MUTATION_SELECT = 'id, file_no, status';

// Minimal select for "all files including batches" — used in invoice modals
const FILE_SELECT_ALL = `
  id, file_no, status, tonnage_mt, delivered_admt, selling_price, purchase_price,
  purchase_currency, sale_currency, currency, freight_cost, parent_file_id, batch_no,
  supplier_id, customer_id,
  customer:customers!customer_id(id, name),
  product:products!product_id(id, name),
  supplier:suppliers!supplier_id(id, name),
  suppliers:trade_file_suppliers(supplier_id)
`;

export const tradeFileService = {
  /** Tüm dosyalar — alt partiler (batch) dahil. Fatura modallarında dosya seçimi için. */
  async listAll(statuses?: TradeFileStatus[]): Promise<TradeFile[]> {
    let query = supabase
      .from('trade_files')
      .select(FILE_SELECT_ALL)
      .is('deleted_at', null)
      .order('file_no', { ascending: true });

    if (statuses?.length) {
      query = query.in('status', statuses);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as unknown as TradeFile[];
  },

  async list(filters?: {
    status?: TradeFileStatus;
    customerId?: string;
    search?: string;
  }): Promise<TradeFile[]> {
    let query = supabase
      .from('trade_files')
      .select(FILE_SELECT)
      .is('deleted_at', null)
      .is('parent_file_id', null)          // sadece ana dosyalar — parti/batch'ler hariç
      .order('created_at', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.customerId) {
      query = query.eq('customer_id', filters.customerId);
    }
    if (filters?.search) {
      query = query.or(
        `file_no.ilike.%${filters.search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (data === null) throw new Error('Request aborted or timed out — please refresh');
    return data as unknown as TradeFile[];
  },

  /** Sayfalı liste — TradeFilesPage için. Sunucu tarafında filtre + pagination. */
  async listPaginated(params: {
    status?: TradeFileStatus;
    customerId?: string;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{ data: TradeFile[]; count: number }> {
    const { page, pageSize, status, customerId, search } = params;
    const from = (page - 1) * pageSize;
    const to   = from + pageSize - 1;

    let query = supabase
      .from('trade_files')
      .select(FILE_SELECT_PAGINATED, { count: 'estimated' })  // exact → full table scan; estimated uses pg_stats
      .is('deleted_at', null)
      .is('parent_file_id', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (status) query = query.eq('status', status);
    if (customerId) query = query.eq('customer_id', customerId);
    // Trailing wildcard — B-tree index kullanabilir, leading % kaldırıldı
    if (search?.trim()) query = query.ilike('file_no', `${search.trim()}%`);

    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    return { data: (data ?? []) as unknown as TradeFile[], count: count ?? 0 };
  },

  async getById(id: string): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .select(FILE_DETAIL_SELECT)
      .eq('id', id)
      .single();

    if (error) throw new Error(error.message);
    return data as unknown as TradeFile;
  },

  async create(
    input: NewTradeFileFormData & {
      file_no: string;
      parent_file_id?: string | null;
      batch_no?: number | null;
      initialStatus?: TradeFileStatus;
      tenantId?: string | null;
    },
  ): Promise<TradeFile> {
    // tenant_id is passed from the hook (useAuth profile) — no extra network calls needed
    const tenantId = input.tenantId ?? null;

    const { data, error } = await supabase
      .from('trade_files')
      .insert({
        tenant_id: tenantId,
        file_no: input.file_no,
        file_date: input.file_date,
        customer_id: input.customer_id,
        product_id: input.product_id,
        tonnage_mt: input.tonnage_mt,
        customer_ref: input.customer_ref,
        notes: input.notes,
        eta: input.eta || null,
        status: (input.initialStatus ?? 'request') as TradeFileStatus,
        parent_file_id: input.parent_file_id ?? null,
        batch_no: input.batch_no ?? null,
      })
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async convertToSale(
    id: string,
    input: SaleConversionFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        status: 'sale' as TradeFileStatus,
        supplier_id: input.supplier_id,
        selling_price: input.selling_price,
        purchase_price: input.purchase_price,
        freight_cost: input.freight_cost,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        incoterms: input.incoterms,
        currency: input.sale_currency,         // backward compat
        purchase_currency: input.purchase_currency,
        sale_currency: input.sale_currency,
        payment_terms: input.payment_terms,
        advance_rate: input.advance_rate,
        purchase_advance_rate: input.purchase_advance_rate ?? 0,
        transport_mode: input.transport_mode,
        eta: input.eta || null,
        vessel_name: input.vessel_name || null,
        proforma_ref: input.proforma_ref || null,
        register_no: input.register_no || null,
      })
      .eq('id', id)
      .eq('status', 'request')
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    if (input.suppliers?.length) {
      await this.syncSuppliers(id, input.suppliers);
    }
    return data as TradeFile;
  },

  /**
   * Bir trade file için çoklu tedarikçi satırlarını eşitler.
   * Mevcut satırlar tamamen silinip yeniden yazılır (delete + insert).
   * Sıralama `position` alanı ile yönetilir (1 = birincil tedarikçi).
   */
  async syncSuppliers(
    tradeFileId: string,
    rows: NonNullable<SaleConversionFormData['suppliers']>,
  ): Promise<void> {
    const { error: delError } = await supabase
      .from('trade_file_suppliers')
      .delete()
      .eq('trade_file_id', tradeFileId);
    if (delError) throw new Error(delError.message);

    if (rows.length === 0) return;

    const payload = rows.map((r, idx) => ({
      trade_file_id: tradeFileId,
      supplier_id: r.supplier_id,
      position: idx + 1,
      quantity_mt: r.quantity_mt,
      purchase_price: r.purchase_price,
      currency: r.currency,
      fx_rate: r.currency === 'USD' ? 1 : r.fx_rate,
      freight_cost: r.freight_cost ?? 0,
      notes: r.notes ?? '',
    }));

    const { error: insError } = await supabase
      .from('trade_file_suppliers')
      .insert(payload);
    if (insError) throw new Error(insError.message);
  },

  async convertToDelivery(
    id: string,
    input: DeliveryFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        status: 'delivery' as TradeFileStatus,
        delivered_admt: input.delivered_admt,
        gross_weight_kg: input.gross_weight_kg,
        packages: input.packages,
        arrival_date: input.arrival_date || null,
        bl_number: input.bl_number || null,
        septi_ref: input.septi_ref || null,
        insurance_tr: input.insurance_tr || null,
        insurance_ir: input.insurance_ir || null,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async updatePnl(
    id: string,
    pnlData: TradeFile['pnl_data'],
  ): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ pnl_data: pnlData })
      .eq('id', id);

    if (error) throw new Error(error.message);
  },

  /** Soft-delete — çöp kutusuna taşı */
  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Geri yükle — çöp kutusundan çıkar */
  async restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ deleted_at: null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Kalıcı sil — CASCADE ile tüm bağlı kayıtları da siler */
  async hardDelete(id: string): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .delete()
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  /**
   * Soft-delete with document choice.
   * keepDocuments=false → dosya + tüm belgeler çöp kutusuna atılır
   * keepDocuments=true  → sadece dosya çöp kutusuna atılır, belgeler "Eşlenmedi" olarak işaretlenir
   */
  async deleteWithChoice(id: string, keepDocuments: boolean): Promise<void> {
    const now = new Date().toISOString();

    if (keepDocuments) {
      // Belgeleri orphan olarak işaretle — çöp kutusuna atma, listede "Eşlenmedi" göster
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('invoices').update({ is_orphaned: true, trade_file_id: null }).eq('trade_file_id', id),
        supabase.from('proformas').update({ is_orphaned: true, trade_file_id: null }).eq('trade_file_id', id),
        supabase.from('packing_lists').update({ is_orphaned: true, trade_file_id: null }).eq('trade_file_id', id),
        supabase.from('transactions').update({ is_orphaned: true }).eq('trade_file_id', id),
      ]);
      const detachErr = r1.error ?? r2.error ?? r3.error ?? r4.error;
      if (detachErr) throw new Error(detachErr.message);
    } else {
      // Tüm bağlı belgeleri de çöp kutusuna at
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from('invoices').update({ deleted_at: now }).eq('trade_file_id', id),
        supabase.from('proformas').update({ deleted_at: now }).eq('trade_file_id', id),
        supabase.from('packing_lists').update({ deleted_at: now }).eq('trade_file_id', id),
        supabase.from('transactions').update({ deleted_at: now }).eq('trade_file_id', id),
      ]);
      const err = r1.error ?? r2.error ?? r3.error ?? r4.error;
      if (err) throw new Error(err.message);
    }

    // Her iki durumda da dosyayı çöp kutusuna at
    const { error } = await supabase.from('trade_files').update({ deleted_at: now }).eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Çöp kutusundaki dosyaları listele */
  async listDeleted(): Promise<TradeFile[]> {
    const { data, error } = await supabase
      .from('trade_files')
      .select(FILE_SELECT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data as unknown as TradeFile[];
  },

  async noteDelay(id: string, data: { revised_eta: string; delay_notes?: string }): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ revised_eta: data.revised_eta, delay_notes: data.delay_notes ?? null })
      .eq('id', id);
    if (error) throw new Error(error.message);
  },

  async countByCustomer(customerId: string): Promise<number> {
    const { count, error } = await supabase
      .from('trade_files')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async updateFileNo(id: string, fileNo: string): Promise<void> {
    const { error } = await supabase
      .from('trade_files')
      .update({ file_no: fileNo })
      .eq('id', id);
    if (error) throw error;
  },

  async countByCustomerPrefix(prefix: string): Promise<number> {
    const { count, error } = await supabase
      .from('trade_files')
      .select('*', { count: 'exact', head: true })
      .like('file_no', `%${prefix}%`);

    if (error) throw new Error(error.message);
    return count ?? 0;
  },

  async updateSaleDetails(
    id: string,
    input: SaleConversionFormData,
  ): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        supplier_id: input.supplier_id,
        selling_price: input.selling_price,
        purchase_price: input.purchase_price,
        freight_cost: input.freight_cost,
        port_of_loading: input.port_of_loading,
        port_of_discharge: input.port_of_discharge,
        incoterms: input.incoterms,
        currency: input.sale_currency,         // backward compat
        purchase_currency: input.purchase_currency,
        sale_currency: input.sale_currency,
        payment_terms: input.payment_terms,
        advance_rate: input.advance_rate,
        purchase_advance_rate: input.purchase_advance_rate ?? 0,
        transport_mode: input.transport_mode,
        eta: input.eta || null,
        vessel_name: input.vessel_name || null,
        proforma_ref: input.proforma_ref || null,
        register_no: input.register_no || null,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    if (input.suppliers?.length) {
      await this.syncSuppliers(id, input.suppliers);
    }
    return data as TradeFile;
  },

  async updateFileInfo(id: string, input: NewTradeFileFormData): Promise<TradeFile> {
    const { data, error } = await supabase
      .from('trade_files')
      .update({
        file_date: input.file_date,
        customer_id: input.customer_id,
        product_id: input.product_id,
        tonnage_mt: input.tonnage_mt,
        customer_ref: input.customer_ref,
        notes: input.notes,
      })
      .eq('id', id)
      .select(MUTATION_SELECT)
      .single();

    if (error) throw new Error(error.message);
    return data as TradeFile;
  },

  async changeStatus(id: string, newStatus: TradeFileStatus, cancelReason?: string): Promise<TradeFile> {
    const patch: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'cancelled' && cancelReason !== undefined) {
      patch.cancel_reason = cancelReason || null;
    }
    const { data, error } = await supabase
      .from('trade_files')
      .update(patch)
      .eq('id', id)
      .select('id, file_no, status, parent_file_id')
      .single();

    if (error) throw new Error(error.message);

    // Parti tamamlandığında / iptal edildiğinde ana dosyanın delivered_admt'sini güncelle
    const parentId = (data as TradeFile & { parent_file_id: string | null }).parent_file_id;
    if (parentId) {
      // Tüm kardeş partileri çek
      const { data: siblings } = await supabase
        .from('trade_files')
        .select('id, status, tonnage_mt')
        .eq('parent_file_id', parentId);

      if (siblings) {
        const delivered = siblings
          .filter((b) => b.status === 'completed')
          .reduce((s: number, b: { tonnage_mt: number | null }) => s + (b.tonnage_mt ?? 0), 0);

        await supabase
          .from('trade_files')
          .update({ delivered_admt: delivered > 0 ? delivered : null })
          .eq('id', parentId);
      }
    }

    return data as TradeFile;
  },
};
