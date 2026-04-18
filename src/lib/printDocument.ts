import type { CompanySettings, BankAccount, TradeFile, PackingList, Invoice, Proforma, Transaction } from '@/types/database';
import { fDate, fDateDMY, fN } from './formatters';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tF(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fN3(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Shared CSS ───────────────────────────────────────────────────────────────

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    background: #f1f5f9;
    color: #000;
    display: flex;
    height: 100vh;
    overflow: hidden;
  }

  /* ── Sidebar ── */
  .sidebar {
    width: 220px;
    min-width: 220px;
    background: #fff;
    border-left: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    padding: 0;
    order: 2;
    z-index: 10;
    overflow-y: auto;
    box-shadow: -2px 0 12px rgba(0,0,0,0.06);
  }
  .sidebar-header {
    padding: 18px 16px 14px;
    border-bottom: 1px solid #f3f4f6;
  }
  .sidebar-co {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #9ca3af;
    margin-bottom: 3px;
  }
  .sidebar-app {
    font-size: 14px;
    font-weight: 800;
    color: #111827;
    letter-spacing: -0.3px;
  }
  .sidebar-app span { color: #dc2626; }
  .sidebar-body {
    padding: 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }
  .sidebar-section {
    font-size: 9px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #9ca3af;
    margin-top: 14px;
    margin-bottom: 4px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f3f4f6;
  }
  .sidebar-section:first-child { margin-top: 0; }
  .btn-primary {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    background: #dc2626;
    color: #fff;
    border: none;
    padding: 11px 16px;
    border-radius: 10px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    width: 100%;
    transition: opacity 0.15s;
    letter-spacing: -0.2px;
  }
  .btn-primary:hover { opacity: 0.88; }
  .btn-ghost {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    background: #f9fafb;
    color: #6b7280;
    border: 1px solid #e5e7eb;
    padding: 9px 16px;
    border-radius: 10px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: background 0.15s, color 0.15s;
  }
  .btn-ghost:hover { background: #f3f4f6; color: #374151; }
  .zoom-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .zoom-btn {
    flex: 1;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 7px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    font-weight: 600;
    color: #374151;
    transition: background 0.15s;
    text-align: center;
  }
  .zoom-btn:hover { background: #e5e7eb; }
  .zoom-val {
    flex: 1.2;
    text-align: center;
    font-size: 12px;
    font-weight: 700;
    color: #111827;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 7px 4px;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px dashed #f3f4f6;
    font-size: 10px;
  }
  .info-row:last-child { border-bottom: none; }
  .info-label { color: #9ca3af; font-weight: 500; }
  .info-val { color: #111827; font-weight: 700; }
  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
  .status-draft { background: #fee2e2; color: #b91c1c; }
  .status-ok    { background: #dcfce7; color: #15803d; }
  .sidebar-footer {
    padding: 10px 14px;
    border-top: 1px solid #f3f4f6;
    font-size: 9px;
    color: #9ca3af;
    text-align: center;
  }

  /* ── Document scroll area ── */
  .doc-area {
    flex: 1;
    overflow: auto;
    padding: 36px 36px 60px;
    order: 1;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .doc-scale-wrapper {
    transform-origin: top center;
    transition: transform 0.2s ease;
  }
  .page {
    background: #fff;
    width: 210mm;
    padding: 14mm 14mm 12mm 14mm;
    box-shadow: 0 12px 48px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.1);
    position: relative;
    border-radius: 3px;
  }

  /* DRAFT watermark */
  .draft-watermark { position: relative; overflow: hidden; }
  .draft-watermark::before {
    content: 'DRAFT';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 130px;
    font-weight: 900;
    color: rgba(0,0,0,0.10);
    letter-spacing: 20px;
    pointer-events: none;
    z-index: 9999;
    white-space: nowrap;
    user-select: none;
  }

  @page {
    size: A4 portrait;
    margin: 12mm 14mm;
  }
  @media print {
    html, body {
      width: 210mm;
      height: auto;
      background: #fff;
      display: block;
      overflow: visible;
    }
    .sidebar { display: none !important; }
    .doc-area {
      display: block !important;
      padding: 0 !important;
      overflow: visible !important;
      width: 100% !important;
    }
    .doc-scale-wrapper {
      transform: none !important;
      width: 100% !important;
    }
    .page {
      box-shadow: none !important;
      width: 100% !important;
      min-width: 0 !important;
      padding: 0 !important;
      margin: 0 !important;
      border-radius: 0 !important;
    }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    .draft-watermark::before { position: absolute; top: 50%; left: 50%; }
  }
`;

const DRAFT_WATERMARK_ATTR = 'draft-watermark';

interface DropboxMeta { customerName: string; fileNo: string; documentName: string; }

export function buildFullHtml(html: string, title: string, isDraft = false, dropboxMeta?: DropboxMeta, companyName?: string): string {
  const draftClass = isDraft ? ` ${DRAFT_WATERMARK_ATTR}` : '';
  const draftBadge = isDraft
    ? `<span class="status-badge status-draft">● Taslak</span>`
    : `<span class="status-badge status-ok">● Onaylı</span>`;
  const co = esc(companyName || 'SUNMAX TRADE');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}${isDraft ? ' [DRAFT]' : ''}</title>
  <style>${BASE_CSS}</style>
</head>
<body>
  <div class="doc-area">
    <div class="doc-scale-wrapper" id="scaleWrap">
      <div class="page${draftClass}">${html}</div>
    </div>
  </div>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-co">${co}</div>
      <div class="sidebar-app">Sun<span>max</span> Trade</div>
    </div>
    <div class="sidebar-body">

      <div class="sidebar-section">İşlemler</div>
      <button class="btn-primary" onclick="window.print()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
        Print / PDF
      </button>
      <button class="btn-ghost" onclick="window.close()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        Kapat
      </button>

      <div class="sidebar-section">Yakınlaştırma</div>
      <div class="zoom-row">
        <button class="zoom-btn" onclick="zoomOut()">−</button>
        <div class="zoom-val" id="zoomVal">100%</div>
        <button class="zoom-btn" onclick="zoomIn()">+</button>
      </div>
      <button class="btn-ghost" onclick="zoomReset()" style="font-size:11px;padding:7px 12px">↺ Sıfırla</button>

      <div class="sidebar-section">Belge</div>
      <div class="info-row">
        <span class="info-label">Başlık</span>
        <span class="info-val" style="max-width:116px;text-align:right;word-break:break-all;font-size:9px">${esc(title)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Durum</span>
        <span>${draftBadge}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Format</span>
        <span class="info-val">A4 / PDF</span>
      </div>
      ${dropboxMeta ? `
      <div class="sidebar-section" style="margin-top:14px">Bulut</div>
      <button id="dbxBtn" class="btn-ghost" onclick="uploadToDropbox()">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M6 2L0 6l6 4-6 4 6 4 6-4-6-4 6-4zM18 2l-6 4 6 4-6 4 6 4 6-4-6-4 6-4zM6 16.5L12 21l6-4.5-6-4z"/></svg>
        Dropbox'a Kaydet
      </button>
      ` : ''}
    </div>
    <div class="sidebar-footer">Ctrl + Scroll → Yakınlaştır</div>
  </div>

  <script>
    var scale = 1;
    var wrap = document.getElementById('scaleWrap');
    var valEl = document.getElementById('zoomVal');
    function applyZoom() {
      wrap.style.transform = 'scale(' + scale + ')';
      valEl.textContent = Math.round(scale * 100) + '%';
    }
    function zoomIn()   { scale = Math.min(scale + 0.1, 2.5); applyZoom(); }
    function zoomOut()  { scale = Math.max(scale - 0.1, 0.3); applyZoom(); }
    function zoomReset(){ scale = 1; applyZoom(); }
    // Ctrl/Cmd + scroll to zoom
    document.addEventListener('wheel', function(e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) zoomIn(); else zoomOut();
      }
    }, { passive: false });
    // Otomatik sığdır
    (function() {
      var docW = 794; // 210mm ≈ 794px
      var availW = document.querySelector('.doc-area').clientWidth - 80;
      if (availW < docW) { scale = Math.max(availW / docW, 0.5); applyZoom(); }
    })();
  </script>
  ${dropboxMeta ? `
  <script>
    var _DBX_CUSTOMER = ${JSON.stringify(dropboxMeta.customerName)};
    var _DBX_FILENO   = ${JSON.stringify(dropboxMeta.fileNo)};
    var _DBX_DOCNAME  = ${JSON.stringify(dropboxMeta.documentName)};
    function uploadToDropbox() {
      if (!window.opener) { alert('Ana uygulama penceresi kapalı.'); return; }
      var btn = document.getElementById('dbxBtn');
      btn.disabled = true;
      btn.innerHTML = '<span style="opacity:.6">Yükleniyor…</span>';
      window.opener.postMessage({
        type: 'DROPBOX_UPLOAD_PDF',
        pageHtml: document.documentElement.outerHTML,
        customerName: _DBX_CUSTOMER,
        fileNo: _DBX_FILENO,
        documentName: _DBX_DOCNAME,
      }, '*');
      function onMsg(e) {
        if (e.data && e.data.type === 'DROPBOX_UPLOAD_DONE') {
          btn.innerHTML = '<span style="color:#16a34a;font-weight:700">✓ Yüklendi</span>';
          window.removeEventListener('message', onMsg);
        } else if (e.data && e.data.type === 'DROPBOX_UPLOAD_ERROR') {
          btn.textContent = "Dropbox'a Kaydet";
          btn.disabled = false;
          alert('Hata: ' + e.data.error);
          window.removeEventListener('message', onMsg);
        }
      }
      window.addEventListener('message', onMsg);
    }
  </script>
  ` : ''}
</body>
</html>`;
}

function openPrintWindow(html: string, title: string, isDraft = false, companyName?: string) {
  const win = window.open('', '_blank', 'width=1100,height=860');
  if (!win) return;
  win.document.write(buildFullHtml(html, title, isDraft, undefined, companyName));
  win.document.close();
}

function logoHTML(s: CompanySettings, maxH = 65, maxW = 170): string {
  return s.logo_url
    ? `<img src="${s.logo_url}" style="max-height:${maxH}px;max-width:${maxW}px;object-fit:contain;display:block">`
    : `<div style="font-size:18px;font-weight:900;color:#000">${esc(s.company_name || '')}</div>`;
}

/** Combined seal+signature block — single SVG/PNG */
const SEAL_URL = '/seal-signature.svg';

function sealBlock(): string {
  return `<img src="${SEAL_URL}" style="display:block;max-width:230px;max-height:110px;object-fit:contain;margin:4px auto 0">`;
}

function footerHTML(s: CompanySettings, showSeal = false): string {
  const email = s.email || '';
  return `
    <div style="text-align:center;margin-top:18px">
      ${showSeal ? sealBlock() : (s.logo_url ? `<img src="${s.logo_url}" style="max-height:55px;max-width:150px;object-fit:contain;display:block;margin:0 auto 4px">` : '')}
      <div style="font-size:10px;color:#333;margin-bottom:2px;margin-top:${showSeal ? '8px' : '0'}">If you have any questions or concerns, please contact</div>
      <div style="font-size:10px;color:#1155cc;margin-bottom:4px">${esc(email)}</div>
      <div style="font-size:11px;font-style:italic;font-weight:700">Thank You For Your Business!</div>
    </div>`;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

function _buildInvoiceBody(inv: Invoice, settings: CompanySettings, bank: BankAccount | null, isDraft = false): string {
  void bank; // bank details shown in comments if needed
  const invAny = inv as unknown as Record<string, unknown>;
  const curr = inv.currency || 'USD';
  const qtyUnit = (invAny['qty_unit'] as string) || 'ADMT';

  // Bill To / Ship To: prefer stored values, fall back to customer data
  const custName = esc(inv.customer?.name || '');
  const custAddr  = esc((inv.customer as unknown as Record<string,unknown>)?.['address'] as string || '');
  const rawBillTo = (invAny['bill_to'] as string) || [inv.customer?.name, (inv.customer as unknown as Record<string,unknown>)?.['address']].filter(Boolean).join('\n');
  const rawShipTo = (invAny['ship_to'] as string) || rawBillTo;
  const billToHtml = esc(rawBillTo).replace(/\n/g, '<br>');
  const shipToHtml = esc(rawShipTo).replace(/\n/g, '<br>');
  void custName; void custAddr;

  const body = `
    <!-- ── Header ── -->
    <table style="width:100%;margin-bottom:6px">
      <tr>
        <td style="width:55%;vertical-align:top">
          ${logoHTML(settings)}
          <div style="font-size:12px;font-weight:700;margin-top:4px">${esc(settings.company_name || '')}</div>
          <div style="font-size:10px;color:#333;margin-top:2px">Address: ${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}</div>
          ${settings.email ? `<div style="font-size:10px;color:#333">E-mail: ${esc(settings.email)}</div>` : ''}
          ${settings.phone ? `<div style="font-size:10px;color:#333">Website: ${esc(settings.phone)}</div>` : ''}
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:28px;font-weight:300;color:#888;letter-spacing:1px">Commercial Invoice</div>
          <div style="font-size:11px;margin-top:10px"><strong>INVOICE NO:</strong> ${esc(inv.invoice_no)}</div>
          <div style="font-size:11px;margin-top:2px"><strong>DATE:</strong> ${fDate(inv.invoice_date)}</div>
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #999;margin:8px 0">

    <!-- ── Bill To / Ship To ── -->
    <table style="width:100%;margin-bottom:0">
      <tr>
        <td style="width:50%;padding-left:14%;vertical-align:top">
          <div style="font-size:10px;text-decoration:underline;margin-bottom:3px">BILL TO:</div>
          <div style="font-size:11px;line-height:1.5">${billToHtml}</div>
        </td>
        <td style="width:50%;vertical-align:top">
          <div style="font-size:10px;text-decoration:underline;margin-bottom:3px">SHIP TO:</div>
          <div style="font-size:11px;line-height:1.5">${shipToHtml}</div>
        </td>
      </tr>
    </table>

    <!-- ── Meta row ── -->
    <table style="width:100%;border-top:1px solid #aaa;border-bottom:1px solid #aaa;margin:10px 0 0 0;font-size:10px">
      <tr>
        <td style="padding:4px 8px;font-weight:700;width:20%">CONTACT</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">PROFORMA NO.</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">CB NO.</td>
        <td style="padding:4px 8px;font-weight:700">INSURANCE NO.</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 6px"></td>
        <td style="padding:2px 8px 6px;font-weight:700">${esc(inv.proforma_no || '')}</td>
        <td style="padding:2px 8px 6px">${esc(inv.cb_no || '')}</td>
        <td style="padding:2px 8px 6px">${esc(inv.insurance_no || '')}</td>
      </tr>
    </table>

    <!-- ── Item table ── -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px">
      <thead>
        <tr style="border-bottom:1px solid #333">
          <th style="padding:7px 6px;text-align:left;width:6%;font-weight:700">ITEM</th>
          <th style="padding:7px 6px;text-align:left;font-weight:700">DESCRIPTION</th>
          <th style="padding:7px 6px;text-align:right;width:14%;font-weight:700">Quantity<br>${qtyUnit}</th>
          <th style="padding:7px 6px;text-align:right;width:12%;font-weight:700">Unit Price<br>${curr}</th>
          <th style="padding:7px 6px;text-align:center;width:10%;font-weight:700">Currency</th>
          <th style="padding:7px 6px;text-align:right;width:15%;font-weight:700">Total Amount<br>${curr}</th>
        </tr>
      </thead>
      <tbody>
        <tr style="border-bottom:1px solid #ddd">
          <td style="padding:8px 6px">1</td>
          <td style="padding:8px 6px">${esc(inv.product_name || '')}</td>
          <td style="padding:8px 6px;text-align:right">${fN3(inv.quantity_admt)}</td>
          <td style="padding:8px 6px;text-align:right">${tF(inv.unit_price)}</td>
          <td style="padding:8px 6px;text-align:center">${curr}</td>
          <td style="padding:8px 6px;text-align:right">${tF(inv.subtotal)}</td>
        </tr>
        ${(inv.freight ?? 0) > 0 ? `<tr style="border-bottom:1px solid #ddd">
          <td style="padding:8px 6px">2</td>
          <td style="padding:8px 6px">Freight Charges</td>
          <td style="padding:8px 6px;text-align:right">—</td>
          <td style="padding:8px 6px;text-align:right">—</td>
          <td style="padding:8px 6px;text-align:center">${curr}</td>
          <td style="padding:8px 6px;text-align:right">${tF(inv.freight)}</td>
        </tr>` : ''}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" style="padding:6px 6px;text-align:right;font-weight:700">TOTAL ${esc(inv.incoterms || 'CPT')} :</td>
          <td style="padding:6px 6px;text-align:right;font-weight:700">${tF(inv.total)}</td>
        </tr>
      </tfoot>
    </table>

    <hr style="border:none;border-top:1px solid #aaa;margin:4px 0 8px">

    <!-- ── Comments ── -->
    <div>
      <div style="font-weight:700;margin-bottom:5px">COMMENTS:</div>
      ${inv.gross_weight_kg ? `<div style="font-weight:700;font-size:11px">TOTAL GROSS WEIGHT : ${Math.round(inv.gross_weight_kg)} KG</div>` : ''}
      <div style="font-weight:700;font-size:11px">TOTAL NET WEIGHT : ${fN3(inv.quantity_admt)} ${qtyUnit}</div>
      ${inv.packing_info ? `<div style="font-weight:700;font-size:11px">TOTAL PACKING : ${esc(inv.packing_info)}</div>` : ''}
      ${inv.payment_terms ? `<div style="font-weight:700;font-size:11px">PAYMENT TERMS : ${esc(inv.payment_terms)}</div>` : ''}
    </div>

    <hr style="border:none;border-top:1px solid #aaa;margin:10px 0">

    ${footerHTML(settings, !isDraft)}
  `;

  return buildFullHtml(body, `Invoice ${inv.invoice_no}`, isDraft, {
    customerName: inv.customer?.name ?? '',
    fileNo: (inv.trade_file as unknown as { file_no?: string } | null)?.file_no ?? '',
    documentName: inv.invoice_no,
  }, settings.company_name);
}

export function generateInvoiceHtml(inv: Invoice, settings: CompanySettings, bank: BankAccount | null, isDraft = false): string {
  return _buildInvoiceBody(inv, settings, bank, isDraft);
}

export function printInvoice(inv: Invoice, settings: CompanySettings, bank: BankAccount | null, isDraft = false) {
  const win = window.open('', '_blank', 'width=1010,height=860');
  if (!win) return;
  win.document.write(_buildInvoiceBody(inv, settings, bank, isDraft));
  win.document.close();
}

// ─── Packing List ─────────────────────────────────────────────────────────────

function _buildPackingListBody(pl: PackingList, settings: CompanySettings, isDraft = false): string {
  const items = pl.packing_list_items ?? [];
  const isTruck = pl.transport_mode === 'truck';
  const isRailway = pl.transport_mode === 'railway';
  const colLabel = isTruck ? 'TIR NO' : isRailway ? 'WAGON NO' : 'CONTAINER NO';

  // unit_label / qty_unit — may not exist pre-migration, fall back gracefully
  const plAny      = pl as unknown as Record<string, unknown>;
  const unitLabel  = esc((plAny['unit_label'] as string) || 'Reels');
  const qtyUnit    = esc((plAny['qty_unit']   as string) || 'ADMT');

  const totReels = items.reduce((s, r) => s + (r.reels ?? 0), 0);
  const totAdmt  = items.reduce((s, r) => s + (r.admt ?? 0), 0);
  const totGross = items.reduce((s, r) => s + (r.gross_weight_kg ?? 0), 0);

  const tfAny = (pl.trade_file as unknown as Record<string, unknown> | null);
  const description = esc(pl.description || (tfAny?.['product'] as Record<string,unknown> | null)?.['name'] as string || '');

  // ── Bill To / Ship To ────────────────────────────────────────────────
  // Prefer the editable bill_to/ship_to saved on the PL, fall back to customer data
  const consigneeAny = (plAny?.['consignee'] as Record<string,unknown> | null);
  const effectiveCust = consigneeAny
    ?? (plAny?.['customer'] as Record<string,unknown> | null)
    ?? (tfAny?.['customer'] as Record<string,unknown> | null)
    ?? null;
  const fallbackName  = esc(effectiveCust?.['name']    as string || '');
  const fallbackAddr  = esc(effectiveCust?.['address'] as string || '');
  const fallbackPhone = esc(effectiveCust?.['phone']   as string || '');

  // bill_to / ship_to are multi-line strings; convert \n → <br>
  const rawBillTo = (plAny['bill_to'] as string | null) || '';
  const rawShipTo = (plAny['ship_to'] as string | null) || '';
  const billToHTML = rawBillTo
    ? rawBillTo.split('\n').map(esc).join('<br>')
    : `<strong>${fallbackName}</strong>${fallbackAddr ? `<br>${fallbackAddr}` : ''}${fallbackPhone ? `<br>TELL: ${fallbackPhone}` : ''}`;
  const shipToHTML = rawShipTo
    ? rawShipTo.split('\n').map(esc).join('<br>')
    : `<strong>${fallbackName}</strong>${fallbackAddr ? `<br>${fallbackAddr}` : ''}${fallbackPhone ? `<br>TELL: ${fallbackPhone}` : ''}`;

  const HL = 'border:none;border-top:1px solid #aaa;margin:0';

  const rowsHTML = items.map((r, i) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:5px 6px;text-align:center;font-size:10px">${i + 1}</td>
      <td style="padding:5px 6px;font-size:10px">${esc(r.vehicle_plate || '')}</td>
      <td style="padding:5px 6px;font-size:10px">${description}</td>
      <td style="padding:5px 6px;text-align:center;font-size:10px">${r.reels || ''}</td>
      <td style="padding:5px 6px;text-align:right;font-size:10px">${r.admt ? fN3(r.admt) : ''}</td>
      <td style="padding:5px 6px;text-align:right;font-size:10px">${r.gross_weight_kg ? fN(r.gross_weight_kg, 0) : ''}</td>
    </tr>`).join('');

  const body = `
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#000;line-height:1.4">

    <!-- ══ HEADER ══ -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px">
      <tr>
        <td style="width:55%;vertical-align:top">
          ${logoHTML(settings, 50, 160)}
          <div style="font-size:11px;font-weight:700;margin-top:5px">${esc(settings.company_name || '')}</div>
          <div style="font-size:9px;color:#333;margin-top:2px;line-height:1.6">
            Address: ${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}<br>
            ${settings.email ? 'E-mail: ' + esc(settings.email) : ''}
            ${settings.phone ? '<br>Website: ' + esc(settings.phone) : ''}
          </div>
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:28px;font-weight:700;color:#bbb;letter-spacing:2px;line-height:1">PACKING LIST</div>
          <div style="font-size:10px;margin-top:10px"><strong>DATE:</strong>&nbsp;&nbsp;${fDate(pl.pl_date)}</div>
        </td>
      </tr>
    </table>

    <!-- ══ BILL TO / SHIP TO ══ -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:0">
      <tr>
        <td style="width:15%">&nbsp;</td>
        <td style="width:35%;vertical-align:top;padding-bottom:10px">
          <div style="font-size:10px;font-weight:700;border-bottom:1px solid #000;padding-bottom:1px;margin-bottom:4px;display:inline-block;padding-right:60px">BILL TO:</div><br>
          <div style="font-size:10px;line-height:1.6">${billToHTML}</div>
        </td>
        <td style="width:50%;vertical-align:top;padding-bottom:10px">
          <div style="font-size:10px;font-weight:700;border-bottom:1px solid #000;padding-bottom:1px;margin-bottom:4px;display:inline-block;padding-right:60px">SHIP TO:</div><br>
          <div style="font-size:10px;line-height:1.6">${shipToHTML}</div>
        </td>
      </tr>
    </table>

    <!-- ══ META ROW ══ -->
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #888;border-bottom:1px solid #888;font-size:10px;margin-bottom:10px">
      <tr>
        <td style="padding:4px 8px;font-weight:700;width:20%">CONTACT</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">INVOICE NO.</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">CB NO.</td>
        <td style="padding:4px 8px;font-weight:700">INSURANCE NO.</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 5px"></td>
        <td style="padding:2px 8px 5px;font-weight:700">${esc(pl.invoice_no || '')}</td>
        <td style="padding:2px 8px 5px">${esc(pl.cb_no || '')}</td>
        <td style="padding:2px 8px 5px">${esc(pl.insurance_no || '')}</td>
      </tr>
    </table>

    <!-- ══ ITEM TABLE ══ -->
    <table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:0">
      <thead>
        <tr style="border-bottom:1px solid #000">
          <th style="padding:6px 6px;text-align:left;width:5%;font-weight:700">ITEM</th>
          <th style="padding:6px 6px;text-align:left;width:28%;font-weight:700">${colLabel}</th>
          <th style="padding:6px 6px;text-align:left;font-weight:700">DESCRIPTION</th>
          <th style="padding:6px 6px;text-align:center;width:11%;font-weight:700">Quantity<br>${unitLabel}</th>
          <th style="padding:6px 6px;text-align:right;width:11%;font-weight:700">${qtyUnit}</th>
          <th style="padding:6px 6px;text-align:right;width:13%;font-weight:700">Gross Weight<br>KG</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #888">
          <td colspan="3" style="padding:5px 6px">&nbsp;</td>
          <td style="padding:5px 6px;text-align:center;font-weight:700">${totReels}</td>
          <td style="padding:5px 6px;text-align:right;font-weight:700">${fN3(totAdmt)}</td>
          <td style="padding:5px 6px;text-align:right;font-weight:700">${fN(totGross, 0)}</td>
        </tr>
      </tfoot>
    </table>

    <!-- ══ COMMENTS ══ -->
    <div style="margin-top:10px">
      <div style="font-weight:700;margin-bottom:3px">COMMENTS:</div>
      <div style="font-weight:700">TOTAL GROSS WEIGHT : ${fN(totGross, 0)} KG</div>
      <div style="font-weight:700">TOTAL NET WEIGHT : ${fN3(totAdmt)} ${qtyUnit}</div>
      <div style="font-weight:700">TOTAL PACKING : ${totReels} ${unitLabel}</div>
      ${pl.comments ? pl.comments.split('\n').filter(Boolean).map(l => `<div style="font-weight:700">${esc(l)}</div>`).join('') : ''}
    </div>

    <!-- ══ FOOTER ══ -->
    <div style="margin-top:20px;text-align:center">
      ${!isDraft ? sealBlock() : (settings.logo_url ? `<img src="${settings.logo_url}" style="max-height:55px;max-width:150px;object-fit:contain;display:block;margin:0 auto 4px">` : '')}
      ${settings.company_name ? `<div style="font-size:9px;font-weight:700;margin-bottom:2px">${esc(settings.company_name)}</div>` : ''}
      <div style="font-size:9px;color:#333;margin-bottom:2px">
        ${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}
      </div>
      <div style="font-size:9px;color:#333;margin-bottom:4px">If you have any questions or concerns, please contact</div>
      ${settings.email ? `<div style="font-size:9px;color:#1155cc;margin-bottom:4px">${esc(settings.email)}</div>` : ''}
      <div style="font-size:10px;font-style:italic;font-weight:700">Thank You For Your Business!</div>
    </div>

  </div>`;
  void HL;

  return buildFullHtml(body, `Packing List ${pl.packing_list_no}`, isDraft, {
    customerName: pl.customer?.name ?? '',
    fileNo: (pl.trade_file as unknown as { file_no?: string } | null)?.file_no ?? '',
    documentName: pl.packing_list_no,
  }, settings.company_name);
}

export function generatePackingListHtml(pl: PackingList, settings: CompanySettings, isDraft = false): string {
  return _buildPackingListBody(pl, settings, isDraft);
}

export function printPackingList(pl: PackingList, settings: CompanySettings, isDraft = false) {
  const win = window.open('', '_blank', 'width=1010,height=860');
  if (!win) return;
  win.document.write(_buildPackingListBody(pl, settings, isDraft));
  win.document.close();
}

// ─── Proforma ────────────────────────────────────────────────────────────────

export function generateProformaHtml(
  pi: Proforma,
  settings: CompanySettings,
  bank: BankAccount | null,
  file?: TradeFile | null,
  isDraft = false,
): string {
  // delegates to printProforma internals — built inline below
  return _buildProformaBody(pi, settings, bank, file, isDraft);
}

function _buildProformaBody(
  pi: Proforma,
  settings: CompanySettings,
  bank: BankAccount | null,
  file?: TradeFile | null,
  isDraft = false,
): string {
  const curr = pi.currency || 'USD';
  const piAny   = pi as unknown as Record<string,unknown>;
  const piTfAny = (pi.trade_file as unknown as Record<string,unknown> | null);
  // Consignee override: if set on proforma, use it; otherwise use trade file's customer
  const consigneeRaw = piAny?.['consignee'] as Record<string,unknown> | null;
  const customerAny  = consigneeRaw
    ?? (file?.customer as unknown as Record<string,unknown> | null)
    ?? (piTfAny?.['customer'] as Record<string,unknown> | null)
    ?? null;
  const custName    = esc(customerAny?.['name']    as string ?? '');
  const custAddr    = esc(customerAny?.['address'] as string ?? '');
  const custCountry = esc(customerAny?.['country'] as string ?? '');
  const custPhone   = esc(customerAny?.['phone']   as string ?? '');

  const bankBlock = bank
    ? `${esc(bank.bank_name || '')}${bank.swift_bic ? ' SWIFT: ' + esc(bank.swift_bic) : ''}<br>` +
      `${bank.iban_usd ? 'IBAN USD: ' + esc(bank.iban_usd) + '<br>' : ''}` +
      `${bank.iban_eur ? 'IBAN EUR: ' + esc(bank.iban_eur) + '<br>' : ''}` +
      `${bank.correspondent_bank ? esc(bank.correspondent_bank) : ''}`
    : '';

  const admt = fN3(pi.quantity_admt).replace(/\.000$/, '');
  const notes = (pi.notes || '').split('\n').filter((l: string) => l.trim()).map((l: string) =>
    l.match(/^1-\s*Total Quantity\s*:/i) ? l.replace(/:.*/, `: ${admt} ADMT`) : l
  );
  const notesHTML = notes.map((l: string) => `<div style="margin-bottom:2px">${esc(l)}</div>`).join('');

  /* reusable style strings */
  const G  = 'background:#d9d9d9'; // gray label bg
  const W  = 'background:#fff';     // white value bg
  const B  = 'border:1px solid #888';
  const P  = 'padding:3px 6px';
  const PV = 'padding:4px 6px';
  const lS = `${W};${B};${P};font-size:10px;font-weight:700;color:#000;vertical-align:top`;
  const vS = `${W};${B};${PV};font-size:10px;font-weight:400;vertical-align:top`;

  const partialText = pi.partial_shipment === 'not'
    ? '(x) not allowed &nbsp;&nbsp; ( ) allowed'
    : '( ) not allowed &nbsp;&nbsp; (x) allowed';

  const body = `
    <!-- ── Header ── -->
    <table style="width:100%;margin-bottom:0;border-collapse:collapse">
      <tr>
        <td style="width:32%;vertical-align:top;padding-top:0;padding-bottom:6px">${logoHTML(settings, 48, 150)}</td>
        <td colspan="2" style="text-align:right;vertical-align:middle;padding-bottom:6px">
          <div style="font-size:22px;font-weight:900;color:#888;letter-spacing:3px;text-transform:uppercase;white-space:nowrap">PROFORMA INVOICE</div>
        </td>
      </tr>
    </table>
    <!-- ══ MAIN DOCUMENT TABLE (14 logical cols → C:P) ══ -->
    <table style="width:100%;border-collapse:collapse;font-size:10px;table-layout:fixed">
      <colgroup>
        <col style="width:4.9%">  <!-- C  item# -->
        <col style="width:7.6%">  <!-- D  desc -->
        <col style="width:7.6%">  <!-- E  desc -->
        <col style="width:7.6%">  <!-- F  desc / transport -->
        <col style="width:7.6%">  <!-- G  port loading -->
        <col style="width:2.4%">  <!-- H  -->
        <col style="width:11.3%"> <!-- I  net kg / port -->
        <col style="width:5.8%">  <!-- J  right labels -->
        <col style="width:5.1%">  <!-- K  -->
        <col style="width:8.5%">  <!-- L  -->
        <col style="width:4.8%">  <!-- M  -->
        <col style="width:10.0%"> <!-- N  -->
        <col style="width:7.0%">  <!-- O  amount / totals -->
        <col style="width:9.8%">  <!-- P  amount / totals -->
      </colgroup>

      <!-- ═══ S1: ISSUER (C:I) | PI Number / Date / Validity (J:P) ═══ -->
      <tr>
        <td colspan="7" rowspan="4" style="${W};${B};padding:4px 6px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#333;margin-bottom:3px">Issuer (name, address):</div>
          <div style="font-weight:700;font-size:10.5px">${esc(settings.company_name || '')}</div>
          <div style="font-size:10px">${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}</div>
          <div style="font-size:9.5px">${settings.phone ? 'Website: ' + esc(settings.phone) + (settings.email ? ' &nbsp; Mail: ' + esc(settings.email) : '') : (settings.email ? 'Mail: ' + esc(settings.email) : '')}</div>
        </td>
        <td colspan="4" style="${lS};text-align:right">Proforma Invoice Number:</td>
        <td colspan="3" style="${lS};color:#c0392b;font-size:10px;font-weight:700">${esc(pi.proforma_no)}</td>
      </tr>
      <tr>
        <td colspan="4" style="${lS};text-align:center">Proforma Invoice Date</td>
        <td colspan="3" style="${lS};text-align:center">Validity date / days of PI</td>
      </tr>
      <tr>
        <td colspan="4" style="${vS};font-weight:700;text-align:center">${fDateDMY(pi.proforma_date)}</td>
        <td colspan="3" style="${vS};font-weight:700;text-align:center">${pi.validity_date ? fDateDMY(pi.validity_date) : '—'}</td>
      </tr>
      <tr>
        <td colspan="5" style="${lS}">Buyer's reference / Buyer Commercial ID No.:</td>
        <td colspan="2" style="${vS}">${esc(pi.buyer_commercial_id || '')}</td>
      </tr>

      <!-- ═══ S2: SHIPPER (C:I) | CONSIGNEE (J:P) ═══ -->
      <tr>
        <td colspan="7" rowspan="3" style="${W};${B};padding:4px 6px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#333;margin-bottom:3px">Shipper (name, address):</div>
          <div style="font-weight:700;font-size:10.5px">${esc(settings.company_name || '')}</div>
          <div style="font-size:10px">${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}</div>
          <div style="font-size:9.5px">${settings.phone ? 'Website: ' + esc(settings.phone) + (settings.email ? ' &nbsp; Mail: ' + esc(settings.email) : '') : (settings.email ? 'Mail: ' + esc(settings.email) : '')}</div>
        </td>
        <td colspan="7" rowspan="3" style="${W};${B};padding:4px 6px;vertical-align:top">
          <div style="font-size:9px;font-weight:600;color:#333;margin-bottom:3px">Consignee (name, address):</div>
          <div style="font-weight:700;font-size:10.5px">${custName}</div>
          <div style="font-size:10px">${custAddr ? custAddr + '<br>' : ''}${custCountry || ''}</div>
          <div style="font-size:10px">${custPhone ? 'Tel: ' + custPhone : ''}</div>
        </td>
      </tr>
      <tr></tr>
      <tr></tr>

      <!-- ═══ S3: BANKERS (C:I) | COUNTRY OF BENEFICIARY (J:P) ═══ -->
      <tr>
        <td colspan="7" style="${lS}">Bankers details:</td>
        <td colspan="7" style="${vS}"><strong>Country of beneficiary:</strong> TURKEY</td>
      </tr>
      <tr>
        <td colspan="7" style="${vS};font-size:9.5px">${bankBlock || '&nbsp;'}</td>
        <td colspan="4" style="${vS}"><strong>Country of origin:</strong> ${esc(pi.country_of_origin || (file?.product as Record<string,unknown> | null | undefined)?.['origin_country'] as string || '')}</td>
        <td colspan="3" style="${vS}"><strong>Country of destination:</strong> ${custCountry || '—'}</td>
      </tr>

      <!-- ═══ S4: PARTIAL SHIPMENT (C:I) | TERMS (J:P) ═══ -->
      <tr>
        <td colspan="7" style="${lS}">Partial shipment:</td>
        <td colspan="4" style="${lS}">Terms of delivery:</td>
        <td colspan="3" style="${vS};font-weight:700">${esc(pi.incoterms || '')}</td>
      </tr>
      <tr>
        <td colspan="7" style="${vS}">${partialText}</td>
        <td colspan="4" style="${lS}">Shipment Method:</td>
        <td colspan="3" style="${vS}">${esc(pi.shipment_method === 'bulk' ? 'Bulk' : pi.shipment_method === 'container' ? 'Container' : '')}</td>
      </tr>
      <tr>
        <td colspan="7" style="${vS}">&nbsp;</td>
        <td colspan="4" style="${lS}">Terms of payment:</td>
        <td colspan="3" style="${vS}">${esc(pi.payment_terms || '')}</td>
      </tr>

      <!-- ═══ S5: TRANSPORT + PORTS (C:I) | PAYMENT INFO (J:P) ═══ -->
      <tr>
        <td colspan="4" style="${lS}">Transport mode and means:</td>
        <td colspan="3" style="${lS}">Port / Airport of loading:</td>
        <td colspan="4" style="${lS}">Place of payment:</td>
        <td colspan="3" style="${vS}">${esc(pi.place_of_payment || '')}</td>
      </tr>
      <tr>
        <td colspan="4" style="${vS}" rowspan="2">${esc(pi.transport_mode === 'truck' ? 'By Truck' : pi.transport_mode === 'railway' ? 'By Railway' : pi.transport_mode === 'sea' ? 'By Sea' : '')}</td>
        <td colspan="3" style="${vS}" rowspan="2">${esc(pi.port_of_loading || '')}</td>
        <td colspan="4" style="${lS}">Vessel Details Confirmation time:</td>
        <td colspan="3" style="${vS}">${esc(pi.vessel_details_confirmation || '—')}</td>
      </tr>
      <tr>
        <td colspan="4" style="${lS}">Time of Delivery:</td>
        <td colspan="3" style="${vS}">${esc(pi.delivery_time || '—')}</td>
      </tr>
      <tr>
        <td colspan="4" style="${lS}">Port / Airport of discharge:</td>
        <td colspan="3" style="${lS}">Final place delivery:</td>
        <td colspan="4" style="${lS}">Transaction currency:</td>
        <td colspan="3" style="${vS};font-weight:700">${curr}</td>
      </tr>
      <tr>
        <td colspan="4" style="${vS}">${esc(pi.port_of_discharge || '')}</td>
        <td colspan="3" style="${vS}">${esc(pi.final_delivery || pi.port_of_discharge || '')}</td>
        <td colspan="4" style="${lS}">Insurance:</td>
        <td colspan="3" style="${vS};font-size:9px">${esc(pi.insurance || 'INSURANCE TO BE ARRANGED BY BUYER')}</td>
      </tr>

      <!-- ═══ S6: PRODUCT TABLE HEADER (full width, gray) ═══ -->
      <tr>
        <td colspan="1" rowspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700;vertical-align:middle">Item</td>
        <td colspan="4" rowspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700;vertical-align:middle">Item description</td>
        <td colspan="2"            style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">Total net</td>
        <td colspan="2"            style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">Total Gross</td>
        <td colspan="2"            style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">Quantity</td>
        <td colspan="1"            style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">Unit price</td>
        <td colspan="2"            style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">Amount</td>
      </tr>
      <tr>
        <td colspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">wt (KG)</td>
        <td colspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">wt (KG)</td>
        <td colspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">ADMT</td>
        <td colspan="1" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">${curr}</td>
        <td colspan="2" style="${B};${G};${P};text-align:center;font-size:10px;font-weight:700">${curr}</td>
      </tr>
      <!-- data row -->
      <tr>
        <td colspan="1" style="${vS};text-align:center">1</td>
        <td colspan="4" style="${vS};text-align:center;font-weight:700">${esc(pi.description || (file?.product as Record<string,unknown> | null | undefined)?.['name'] as string || '')}</td>
        <td colspan="2" style="${vS};text-align:center">${pi.net_weight_kg ? fN(pi.net_weight_kg, 0) : ''}</td>
        <td colspan="2" style="${vS};text-align:center">${pi.gross_weight_kg ? fN(pi.gross_weight_kg, 0) : ''}</td>
        <td colspan="2" style="${vS};text-align:center">${fN(pi.quantity_admt, 0)}</td>
        <td colspan="1" style="${vS};text-align:center">${tF(pi.unit_price)}</td>
        <td colspan="2" style="${vS};text-align:center">${tF(pi.subtotal)}</td>
      </tr>

      <!-- ═══ S7: NOTES (C:N = 12 cols) | TOTALS (O:P = 2 cols) ═══ -->
      <!-- notes rowspan=6 matches all right-column rows -->
      <tr>
        <td colspan="12" rowspan="6" style="${W};${B};padding:5px 6px;font-size:10px;font-weight:400;line-height:1.7;vertical-align:top">
          ${notesHTML}
        </td>
        <!-- Sub Total: tall single cell -->
        <td colspan="2" style="${W};${B};${PV};vertical-align:middle;text-align:center;height:65px">
          <div style="font-weight:700;font-size:10px">Sub Total:</div>
          <div style="font-weight:700;font-size:12px">${curr} ${tF(pi.subtotal)}</div>
        </td>
      </tr>
      <!-- Discount: 1 small row -->
      <tr>
        <td colspan="2" style="${W};${B};${PV}">
          <span style="font-weight:700">Discount: </span>${(pi.discount ?? 0) > 0 ? tF(pi.discount) : 'N/A'}
        </td>
      </tr>
      <!-- Freight: 1 small row -->
      <tr>
        <td colspan="2" style="${W};${B};${PV}">
          <span style="font-weight:700">Freight Charges: </span>${(pi.freight ?? 0) > 0 ? tF(pi.freight) : 'N/A'}
        </td>
      </tr>
      <!-- Other Charges: 1 small row -->
      <tr>
        <td colspan="2" style="${W};${B};${PV}">
          <span style="font-weight:700">Other Charges: </span>${(pi.other_charges ?? 0) > 0 ? tF(pi.other_charges) : 'N/A'}
        </td>
      </tr>
      <!-- Total Amount: tall single cell, gray -->
      <tr>
        <td colspan="2" style="${W};${B};${PV};background:#d9d9d9;vertical-align:middle;text-align:center;height:65px">
          <div style="font-weight:700;font-size:10px">Total Amount:</div>
          <div style="font-weight:700;font-size:12px">${curr} ${tF(pi.total)}</div>
        </td>
      </tr>
      <!-- Diagonal cell: only right 2 cols, fills remaining space -->
      <tr>
        <td colspan="2" style="${W};${B};height:55px;background:linear-gradient(to bottom right,transparent calc(50% - 0.5px),#888 calc(50% - 0.5px),#888 calc(50% + 0.5px),transparent calc(50% + 0.5px))"></td>
      </tr>

      <!-- ═══ S8: CERTIFICATION (C:K = 9 cols) | SIGNATORY (L:P = 5 cols) ═══ -->
      <tr style="vertical-align:top">
        <td colspan="9" rowspan="5" style="${W};${B};padding:6px 8px;font-size:9.5px;font-style:italic;line-height:1.65;vertical-align:middle">
          It is hereby certified that this invoice shows the actual price of the goods described,
          that no other invoice has been or will be issued, and that all particulars are true and correct.
        </td>
        <td colspan="3" style="${lS}">NAME OF SIGNATORY:</td>
        <td colspan="2" style="${vS};font-weight:700">${esc(pi.signatory || settings.signatory || '')}</td>
      </tr>
      <tr>
        <td colspan="3" style="${lS}">PLACE AND DATE OF ISSUE:</td>
        <td colspan="2" style="${vS}">TURKEY &nbsp; ${fDateDMY(pi.proforma_date)}</td>
      </tr>
      <tr>
        <td colspan="5" style="${lS}">SEAL AND SIGNATURE:</td>
      </tr>
      <tr>
        <td colspan="5" rowspan="2" style="${W};${B};text-align:center;vertical-align:middle;height:90px">
          ${!isDraft ? sealBlock() : ''}
        </td>
      </tr>
      <tr></tr>

    </table>

    <!-- ── Footer (red line + red text) ── -->
    <div style="margin-top:8px;border-top:2px solid #c0392b;padding-top:5px;text-align:center">
      <span style="font-size:10px;color:#c0392b">
        ${esc(settings.address_line1 || '')}${settings.address_line2 ? ' &nbsp;|&nbsp; ' + esc(settings.address_line2) : ''}
        &nbsp;&nbsp; WWW.PLUSKIMYA.COM &nbsp;&nbsp;
        ${settings.email ? esc(settings.email).toUpperCase() : ''}
      </span>
    </div>
  `;

  const rawCustomerName = (customerAny?.['name'] as string) ?? '';
  return buildFullHtml(body, `Proforma Invoice ${pi.proforma_no}`, isDraft, {
    customerName: rawCustomerName,
    fileNo: file?.file_no ?? pi.proforma_no,
    documentName: pi.proforma_no,
  }, settings.company_name);
}

export function printProforma(
  pi: Proforma,
  settings: CompanySettings,
  bank: BankAccount | null,
  file?: TradeFile | null,
  isDraft = false,
) {
  const win = window.open('', '_blank', 'width=1010,height=860');
  if (!win) return;
  win.document.write(_buildProformaBody(pi, settings, bank, file, isDraft));
  win.document.close();
}

// ─── Receipt / Payment Voucher ───────────────────────────────────────────────

export function printReceipt(txn: Transaction, settings: CompanySettings, isDraft = false) {
  const isReceipt = txn.transaction_type === 'receipt';
  const title = isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER';
  const docNo = txn.reference_no || txn.id.slice(0, 8).toUpperCase();
  const curr = txn.currency ?? 'USD';
  const partyLabel = isReceipt ? 'Received From' : 'Paid To';
  const party = txn.customer?.name || txn.supplier?.name || txn.service_provider?.name || txn.party_name || '—';
  const fileNo = txn.trade_file?.file_no ?? '';

  const body = `
    <!-- Header -->
    <table style="width:100%;margin-bottom:18px">
      <tr>
        <td style="width:50%;vertical-align:top">
          ${logoHTML(settings, 60, 160)}
          <div style="margin-top:6px;font-size:10px;color:#555;line-height:1.6">
            ${esc(settings.company_name || '')}<br>
            ${esc(settings.address_line1 || '')}${settings.address_line2 ? '<br>' + esc(settings.address_line2) : ''}
            ${settings.phone ? '<br>' + esc(settings.phone) : ''}
          </div>
        </td>
        <td style="width:50%;text-align:right;vertical-align:top">
          <div style="font-size:22px;font-weight:900;color:#111;letter-spacing:1px">${title}</div>
          <div style="margin-top:8px;font-size:10.5px;color:#555">
            <div>No: <strong style="color:#000">${esc(docNo)}</strong></div>
            <div style="margin-top:3px">Date: <strong style="color:#000">${fDate(txn.transaction_date)}</strong></div>
            ${fileNo ? `<div style="margin-top:3px">File: <strong style="color:#000">${esc(fileNo)}</strong></div>` : ''}
          </div>
        </td>
      </tr>
    </table>

    <!-- Divider -->
    <div style="border-top:2px solid #111;margin-bottom:18px"></div>

    <!-- Party & Amount Box -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <tr>
        <td style="width:60%;padding:10px 14px;border:1px solid #ccc;background:#f9f9f9;vertical-align:top">
          <div style="font-size:9.5px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">${partyLabel}</div>
          <div style="font-size:14px;font-weight:700;color:#111">${esc(party)}</div>
        </td>
        <td style="width:40%;padding:10px 14px;border:1px solid #ccc;background:#111;text-align:center;vertical-align:middle">
          <div style="font-size:9.5px;color:#aaa;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px">Amount</div>
          <div style="font-size:20px;font-weight:900;color:#fff">${curr} ${tF(txn.amount)}</div>
        </td>
      </tr>
    </table>

    <!-- Details -->
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px;font-size:10.5px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="padding:7px 10px;border:1px solid #ddd;text-align:left;font-weight:700">Description</th>
          <th style="padding:7px 10px;border:1px solid #ddd;text-align:center;width:100px;font-weight:700">Currency</th>
          <th style="padding:7px 10px;border:1px solid #ddd;text-align:right;width:130px;font-weight:700">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:8px 10px;border:1px solid #ddd">${esc(txn.description || '—')}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:center">${curr}</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:right;font-weight:700">${tF(txn.amount)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="background:#f9f9f9">
          <td colspan="2" style="padding:8px 10px;border:1px solid #ddd;text-align:right;font-weight:700">TOTAL</td>
          <td style="padding:8px 10px;border:1px solid #ddd;text-align:right;font-weight:900;font-size:12px">${curr} ${tF(txn.amount)}</td>
        </tr>
      </tfoot>
    </table>

    ${(() => { try { JSON.parse(txn.notes || ''); return ''; } catch { return txn.notes ? `
    <!-- Notes -->
    <div style="border:1px solid #ddd;padding:8px 12px;border-radius:4px;font-size:10px;color:#555;margin-bottom:18px">
      <strong>Notes:</strong> ${esc(txn.notes)}
    </div>` : ''; } })()}

    <!-- Signatures -->
    <table style="width:100%;margin-top:32px">
      <tr>
        <td style="width:45%;text-align:center;padding:0 10px">
          <div style="border-top:1px solid #000;padding-top:6px;font-size:10px;color:#555">
            ${isReceipt ? 'Received By' : 'Approved By'}
          </div>
        </td>
        <td style="width:10%"></td>
        <td style="width:45%;text-align:center;padding:0 10px">
          <div style="border-top:1px solid #000;padding-top:6px;font-size:10px;color:#555">
            ${isReceipt ? 'Authorized Signature' : 'Paid By'}
          </div>
        </td>
      </tr>
    </table>

    ${footerHTML(settings)}
  `;

  openPrintWindow(body, `${title} - ${docNo}`, isDraft, settings.company_name);
}

// ─── Transaction Invoice (purchase_inv / svc_inv / sale_inv) ─────────────────

export function printTransactionInvoice(txn: Transaction, settings: CompanySettings, isDraft = false) {
  const TYPE_TITLES: Record<string, string> = {
    purchase_inv: 'PURCHASE INVOICE',
    svc_inv:      'SERVICE INVOICE',
    sale_inv:     'SALE INVOICE',
  };
  const title  = TYPE_TITLES[txn.transaction_type] ?? 'INVOICE';
  const docNo  = txn.reference_no || txn.id.slice(0, 8).toUpperCase();
  const curr   = txn.currency ?? 'USD';
  const fileNo = txn.trade_file?.file_no ?? '';

  const isPurchase = txn.transaction_type === 'purchase_inv';
  const isSvc      = txn.transaction_type === 'svc_inv';
  const isSale     = txn.transaction_type === 'sale_inv';

  // For purchase/service invoices the supplier is the issuer; our company is the bill-to.
  // For sale invoices our company is the issuer; customer is the bill-to.
  const issuerName    = isSale
    ? (settings.company_name || '')
    : (txn.supplier?.name || txn.service_provider?.name || txn.party_name || '—');
  const issuerAddr1   = isSale
    ? (settings.address_line1 || '')
    : (txn.supplier?.address || txn.service_provider?.address || '');
  const issuerAddr2   = isSale ? (settings.address_line2 || '') : '';
  const issuerPhone   = isSale
    ? (settings.phone || '')
    : (txn.supplier?.phone || txn.service_provider?.phone || '');
  const issuerEmail   = isSale
    ? (settings.email || '')
    : (txn.supplier?.email || txn.service_provider?.email || '');
  const issuerCountry = isSale ? '' : (txn.supplier?.country || txn.service_provider?.country || '');
  const issuerTaxId   = isSale ? '' : (txn.supplier?.tax_id || '');

  const billToName    = isSale
    ? (txn.customer?.name || txn.party_name || '—')
    : (settings.company_name || '');
  const billToAddr    = isSale ? '' : (settings.address_line1 || '');

  // Exchange rate row (show only when currency ≠ USD and rate exists)
  const hasRate = curr !== 'USD' && txn.exchange_rate && txn.exchange_rate > 0;
  const amountUsd = txn.amount_usd ?? 0;

  // For purchase invoices, add product/tonnage detail if available from trade_file
  const tf       = txn.trade_file as (typeof txn.trade_file & { product?: { name: string }; tonnage_mt?: number; purchase_currency?: string }) | undefined;
  const product  = tf?.product?.name || '';
  const tonnage  = tf?.tonnage_mt;

  const body = `
    <!-- Header -->
    <table style="width:100%;margin-bottom:20px">
      <tr>
        <td style="width:55%;vertical-align:top">
          ${isSale ? logoHTML(settings, 60, 160) : ''}
          <div style="margin-top:${isSale ? 6 : 0}px;font-size:${isSale ? 10 : 14}px;${isSale ? 'color:#555;' : 'font-weight:800;color:#111;'}line-height:1.7">
            ${esc(issuerName)}
          </div>
          <div style="margin-top:4px;font-size:10px;color:#555;line-height:1.7">
            ${issuerAddr1 ? esc(issuerAddr1) : ''}
            ${issuerAddr2 ? '<br>' + esc(issuerAddr2) : ''}
            ${issuerCountry ? '<br>' + esc(issuerCountry) : ''}
            ${issuerPhone ? '<br>Tel: ' + esc(issuerPhone) : ''}
            ${issuerEmail ? '<br>' + esc(issuerEmail) : ''}
            ${issuerTaxId ? '<br>Tax ID: ' + esc(issuerTaxId) : ''}
          </div>
        </td>
        <td style="width:45%;text-align:right;vertical-align:top">
          <div style="font-size:22px;font-weight:900;color:#111;letter-spacing:1px">${title}</div>
          <table style="margin-top:10px;margin-left:auto;font-size:10.5px;border-collapse:collapse">
            <tr>
              <td style="padding:3px 10px 3px 0;color:#666;text-align:right">Invoice No:</td>
              <td style="padding:3px 0;font-weight:700">${esc(docNo)}</td>
            </tr>
            <tr>
              <td style="padding:3px 10px 3px 0;color:#666;text-align:right">Date:</td>
              <td style="padding:3px 0;font-weight:700">${fDate(txn.transaction_date)}</td>
            </tr>
            ${fileNo ? `<tr>
              <td style="padding:3px 10px 3px 0;color:#666;text-align:right">File No:</td>
              <td style="padding:3px 0;font-weight:700">${esc(fileNo)}</td>
            </tr>` : ''}
            <tr>
              <td style="padding:3px 10px 3px 0;color:#666;text-align:right">Currency:</td>
              <td style="padding:3px 0;font-weight:700">${curr}</td>
            </tr>
            ${hasRate ? `<tr>
              <td style="padding:3px 10px 3px 0;color:#666;text-align:right">Exchange Rate:</td>
              <td style="padding:3px 0;font-weight:700">1 ${curr} = ${tF(txn.exchange_rate!)} USD</td>
            </tr>` : ''}
          </table>
        </td>
      </tr>
    </table>

    <div style="border-top:2px solid #111;margin-bottom:16px"></div>

    <!-- Bill To / From parties -->
    <table style="width:100%;margin-bottom:16px;border-collapse:collapse">
      <tr>
        <td style="width:50%;vertical-align:top;padding-right:12px">
          <div style="padding:10px 14px;border:1px solid #ddd;background:#f9f9f9;border-radius:4px;height:100%">
            <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Bill To</div>
            <div style="font-size:13px;font-weight:700">${esc(billToName)}</div>
            ${billToAddr ? `<div style="font-size:10px;color:#555;margin-top:4px">${esc(billToAddr)}</div>` : ''}
          </div>
        </td>
        <td style="width:50%;vertical-align:top;padding-left:12px">
          ${(isPurchase || isSvc) && txn.trade_file ? `
          <div style="padding:10px 14px;border:1px solid #ddd;background:#f9f9f9;border-radius:4px">
            <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Trade File</div>
            <div style="font-size:12px;font-weight:700">${esc(fileNo)}</div>
            ${product ? `<div style="font-size:10px;color:#555;margin-top:2px">${esc(product)}</div>` : ''}
            ${tonnage != null ? `<div style="font-size:10px;color:#555">Tonnage: ${tF(tonnage)} MT</div>` : ''}
          </div>` : ''}
        </td>
      </tr>
    </table>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:16px">
      <thead>
        <tr style="background:#111;color:#fff">
          <th style="padding:8px 10px;text-align:left">#</th>
          <th style="padding:8px 10px;text-align:left">Description</th>
          ${(isPurchase || isSvc) && tonnage != null ? `<th style="padding:8px 10px;text-align:right;width:90px">Qty (MT)</th>` : ''}
          <th style="padding:8px 10px;text-align:right;width:150px">Amount (${curr})</th>
          ${hasRate ? `<th style="padding:8px 10px;text-align:right;width:120px">Amount (USD)</th>` : ''}
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #eee">1</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eee">${esc(txn.description || (product || '—'))}</td>
          ${(isPurchase || isSvc) && tonnage != null ? `<td style="padding:9px 10px;border-bottom:1px solid #eee;text-align:right">${tF(tonnage)}</td>` : ''}
          <td style="padding:9px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${tF(txn.amount)}</td>
          ${hasRate ? `<td style="padding:9px 10px;border-bottom:1px solid #eee;text-align:right;color:#555">USD ${tF(amountUsd)}</td>` : ''}
        </tr>
      </tbody>
      <tfoot>
        <tr style="background:#f3f4f6">
          <td colspan="${2 + ((isPurchase || isSvc) && tonnage != null ? 1 : 0)}" style="padding:9px 10px;text-align:right;font-weight:700;border-top:2px solid #ddd">TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:900;font-size:13px;border-top:2px solid #ddd">
            ${curr} ${tF(txn.amount)}
          </td>
          ${hasRate ? `<td style="padding:9px 10px;text-align:right;font-weight:900;font-size:13px;border-top:2px solid #ddd;color:#555">USD ${tF(amountUsd)}</td>` : ''}
        </tr>
        ${txn.paid_amount > 0 ? `
        <tr>
          <td colspan="${2 + ((isPurchase || isSvc) && tonnage != null ? 1 : 0)}" style="padding:6px 10px;text-align:right;color:#16a34a;font-weight:600">Paid</td>
          <td style="padding:6px 10px;text-align:right;color:#16a34a;font-weight:700">- ${curr} ${tF(txn.paid_amount)}</td>
          ${hasRate ? '<td></td>' : ''}
        </tr>
        <tr style="background:#fef9c3">
          <td colspan="${2 + ((isPurchase || isSvc) && tonnage != null ? 1 : 0)}" style="padding:8px 10px;text-align:right;font-weight:700">Balance Due</td>
          <td style="padding:8px 10px;text-align:right;font-weight:900;font-size:13px;color:#dc2626">
            ${curr} ${tF(txn.amount - txn.paid_amount)}
          </td>
          ${hasRate ? '<td></td>' : ''}
        </tr>` : ''}
      </tfoot>
    </table>

    ${(() => { try { JSON.parse(txn.notes || ''); return ''; } catch { return txn.notes ? `
    <div style="border:1px solid #ddd;padding:8px 12px;border-radius:4px;font-size:10px;color:#555;margin-bottom:16px">
      <strong>Notes:</strong> ${esc(txn.notes)}
    </div>` : ''; } })()}

    <!-- Signatures -->
    <table style="width:100%;margin-top:36px">
      <tr>
        <td style="width:45%;text-align:center;padding:0 10px">
          <div style="border-top:1px solid #000;padding-top:6px;font-size:10px;color:#555">Prepared By</div>
        </td>
        <td style="width:10%"></td>
        <td style="width:45%;text-align:center;padding:0 10px">
          <div style="border-top:1px solid #000;padding-top:6px;font-size:10px;color:#555">Authorized Signature</div>
        </td>
      </tr>
    </table>

    ${footerHTML(settings)}
  `;

  openPrintWindow(body, `${title} - ${docNo}`, isDraft, settings.company_name);
}
