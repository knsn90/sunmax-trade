---
name: esenkim-import
description: Esenkim (veya benzeri) tenant'a Dropbox'taki geçmiş satın alma/satış "Part" klasörlerinden eski ticaret verisini uygulamaya toplu import etme süreci. Kullanıcı "eski verileri gir", "Part-XX'i işle", "geçmiş satışları aktar", "şu klasörü uygulamaya ekle" ya da Nişadır/Amonyum gibi ürün klasörlerinden veri girmek istediğinde kullan. Supabase'e trade_files + invoices + transactions yazar, gerçek firma isimlerini belgelerden çıkarır, Dropbox klasörünü bağlar, bakiyeleri doğrular.
---

# Esenkim Geçmiş Veri Import Skill

Dropbox'taki `Family Room/02-ESENKİM/02-Reports/<ürün>/Part-XX/` klasörlerindeki eski ticaret dosyalarını uygulamaya (Supabase) tam sadık şekilde girer. Cari, Müşteri Raporu ve Kar/Zarar'ın doğru çalışması için sadece satır değil, muhasebe işlemlerini (`transactions`) de üretir.

## Sabitler

- **Esenkim tenant_id:** `6cb82c55-ddce-4ac8-b0fc-533029a6a244` (SUNPLUS: `cc61c530-e404-4ccd-9ecf-8288e4eae2a8`)
- **Supabase project_id:** `gramxnhbkbnjbmkdomjf`
- Import **MCP `execute_sql`** ile yapılır (RLS bypass → `tenant_id` her satırda AÇIKÇA verilmeli; tenant trigger sadece NULL ise doldurur).
- Kullanıcının Esenkim oturumuyla görsel doğrulama kullanıcıya bırakılır (ben o oturumla giriş yapamam).

## Veri kaynakları (öncelik sırası)

1. **Master Excel** (`Report <ürün>.xlsx`, sheet ör. "Amonyum") — iskelet: Part No, Alış Fiyatı, Tonaj, tarihler, depo, Müşteri, Fatura No/Tarihi, Satış Fiyatı. Ara-toplam satırlarını (Part No/müşteri/fatura boş, tonaj dolu) ATLA.
2. **Part Excel** (`Part-XX/Part-XX.xlsx`, sheet "Sheet1") — Farsça masraf kırılımı: satıcı (فروشنده), alıcı (خریدار), net/brüt tonaj, alış/satış fiyatı, masraf kalemleri (باربری=navlun, گمرک=gümrük, ترخیص کار=terhis/müşavir, بازرس گمرک=gümrük muayene, تخفیف=iskonto), قیمت تمام شده=maliyet, سود=kâr.
3. **Derlenmiş PDF** (`Part-XX/Nişadır-X.pdf` gibi büyük ~8MB dosya) — GERÇEK hizmet faturaları burada (küçük Dekont.pdf'ler genelde sermaye/döviz işlemi, işe yaramaz). `Read` ile `pages` parametresiyle oku. **Kullanıcı: her klasördeki TÜM dosyaları oku, bilgileri çıkar.**

## Firma çıkarma kuralları

- **Ürün** sadece ana tedarikçiden (ör. ALVAND SHIMI NASR). Masrafları ASLA tedarikçiye yazma.
- Her masraf GERÇEK hizmet firmasına (`service_provider`) bağlanır — derlenmiş PDF'ten çıkar.
- **Tekrar eden firmalar** (bir kez oluştur, tekrar kullan): **VTC - Vazin Tarabar Co.** (İran freight forwarder/navlun), **Toroslar Lojistik Gümrük Müşavirliği** (gümrük müşaviri/terhis).
- **Gümrük vergisi** → "Konya Gümrük Müdürlüğü" (veya ilgili gümrük). Tutar = toplam gümrük vergisi EKSİ iade edilebilir KDV (master/Part Excel bu net tutarı tutar; Ziraat tahsilat makbuzundaki KDV'yi düş).
- Firma çıkmayan kalemler (iskonto/diğer) → "Muhtelif Masraf" service_provider.

## Muhasebe kararları (kullanıcı onaylı)

- **Ödeme durumu:** eski/kapanmış işlemler ödenmiş/kapalı → bakiye 0.
- **Masraflar dâhil**, `svc_inv` kalem kalem (uygulamada "Hizmet Faturaları" görünsün). `freight_cost=0` (çift sayma olmaz).
- **FIFO:** master Excel'de Part No'su boş satış satırları en eski stoklu partiye (ileride ele alınacak).

## Import adımları (parti başına)

1. **Şema/tetik kontrolü** (bir kez yeterli): `trade_files`'ta advance/final obligation trigger'ları SADECE UPDATE'te çalışır → `completed` INSERT güvenli, otomatik işlem üretmez. `fn_sync_primary_supplier` supplier/price zaten aynıysa UPDATE tetiklemez.
2. **Master kayıtlar** (varsa tekrar oluşturma; `code` tenant-scoped unique): `products`, `customers`, `suppliers`, gerekli `service_providers`. Zorunlu: `code`, `name`, `tenant_id`.
3. **trade_files** (`status='completed'`, product/customer/supplier, `tonnage_mt`, `delivered_admt`, `purchase_price`=ürün fiyatı, `selling_price`, `purchase_currency`/`sale_currency`/`currency='USD'`, `file_date`, `freight_cost=0`, `file_no` ör. "Amonyum P-01", `batch_no`=parti no).
4. **trade_file_suppliers** (primary tedarikçi, position 1).
5. **invoices** (`invoice_type='sale'`, `invoice_no`=GIB/ESN no [GLOBAL unique], `product_name`, `quantity_admt`, `unit_price`, `subtotal`, `total`, `doc_status='approved'`).
6. **transactions** (hepsi tek atomik `DO $$` bloğunda, hata olursa rollback):
   - `purchase_inv` (tedarikçi, ürün tutarı, open) + `payment` (tedarikçi, paid)
   - `sale_inv` (müşteri, open) + `receipt` (müşteri, paid)
   - Her masraf: `svc_inv` (party_type='service_provider', gerçek firma, open) + o firmaya `payment` (paid)
   - Alanlar: `exchange_rate=1`, `amount_usd=amount`, açık faturalarda `paid_amount=0`/`payment_status='open'`, kapatma ödemelerinde `paid_amount=amount`/`payment_status='paid'`, `doc_status='approved'`, `tenant_id` açık.
7. **Dropbox bağla:** `trade_files.dropbox_folder_url` = `https://www.dropbox.com/home/<url-encoded path>` (Python: `"/".join(urllib.parse.quote(seg) for seg in path.split("/"))`), `dropbox_folder_path`=Dropbox-relative yol. Böylece uygulama yeni boş klasör açmaz. Gruplu klasörlerde (Part-14-15-16) birden çok parti aynı URL'e.

## Bayraklama (ZORUNLU — kullanıcı talebi)

Kontrol gerektiren / belirsiz her işlemi `transactions.flagged=true` + `flag_note='<açıklama>'` ile işaretle (uygulamada Muhasebe'de bayrak ikonu + filtre ile görünür). Bayrakla:
- Master Excel ↔ Part Excel ↔ gerçek fatura arasında **fiyat/tutar çelişkisi** (ör. satış 415 vs 430; notta hangisinin neden seçildiğini yaz).
- **Belirsiz karşı taraf** (ör. ordino müşteri üzerinden yansıtma; masraf hangi firmaya ait net değil).
- **Tahmini/eksik** veri, iptal edilmiş fatura, olağan dışı kalem.
Not kısa ve Türkçe; kullanıcının kararı için yeterli bağlam ver. Kesin/net işlemleri bayraklama.

## Doğrulama (her partiden sonra)

```sql
-- Bakiyeler 0, kâr Excel ile aynı olmalı
with tf as (select id, freight_cost from trade_files where tenant_id='<esenkim>' and file_no='<file_no>')
select
 (select count(*) from transactions t,tf where t.trade_file_id=tf.id) as txn_count,
 (select json_object_agg(party_name,bal) from (
    select party_name, sum(case when transaction_type in ('sale_inv','purchase_inv','svc_inv') then amount_usd else -amount_usd end) bal
    from transactions t,tf where t.trade_file_id=tf.id group by party_name) x) as bakiyeler,  -- hepsi 0
 (select sum(case when transaction_type in('purchase_inv','svc_inv') then amount_usd else 0 end) from transactions t,tf where t.trade_file_id=tf.id)+(select freight_cost from tf) as maliyet;
```

## Bilinen uygulama düzeltmesi

Kar/Zarar "Tüm Dosyalar Özeti" eskiden masrafları (svc_inv) saymıyordu (özet sorgusu dosya seçilmeden işlemleri yüklemiyordu). Düzeltildi: `transactionService.costByFile()` + `useCostByFile()` hook + `ReportsPage` PnlReportTab. Özet artık `costByFile` hafif sorgusundan besleniyor. Bu düzeltme Sunplus'ı da doğrular.

## Kadans

Parti parti ilerle: klasörü oku → firmaları/tutarları çıkar → gir → doğrula → kullanıcıya göster. İlk birkaç partiyi kullanıcıyla kontrol et. Master Excel'i olmayan ürünlerde (11 üründen 9'u) veriyi Part-Excel/belgelerden topla veya kullanıcıya sor.

İlgili hafıza: `project_esenkim_import.md`.
