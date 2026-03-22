import type { CompanySettings, BankAccount, TradeFile, PackingList, Invoice, Proforma, Transaction } from '@/types/database';
import { fDate, fN } from './formatters';

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
    background: #888;
    padding: 20px;
    color: #000;
  }
  .page {
    background: #fff;
    width: 210mm;
    margin: 0 auto;
    padding: 14mm 14mm 12mm 14mm;
    box-shadow: 0 4px 24px rgba(0,0,0,.4);
    position: relative;
  }
  .np { text-align: center; margin-bottom: 14px; }
  @media print {
    body { background: #fff; padding: 0; }
    .np { display: none; }
    .page { box-shadow: none; width: 100%; padding: 10mm; margin: 0; }
  }
  /* DRAFT watermark */
  .draft-watermark {
    position: relative;
  }
  .draft-watermark::before {
    content: 'DRAFT';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 140px;
    font-weight: 900;
    color: rgba(0,0,0,0.07);
    letter-spacing: 20px;
    pointer-events: none;
    z-index: 9999;
    white-space: nowrap;
    user-select: none;
  }
  @media print {
    .draft-watermark::before {
      position: fixed;
      top: 50%;
      left: 50%;
    }
  }
`;

const DRAFT_WATERMARK_ATTR = 'draft-watermark';

const PRINT_BAR = `<div class="np">
  <button onclick="window.print()" style="background:#333;color:#fff;border:none;padding:10px 28px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;margin-right:8px">🖨 Print / PDF</button>
  <button onclick="window.close()" style="background:#f3f4f6;color:#374151;border:1px solid #ccc;padding:10px 20px;border-radius:6px;font-size:13px;cursor:pointer">✕ Close</button>
</div>`;

function openPrintWindow(html: string, title: string, isDraft = false) {
  const win = window.open('', '_blank', 'width=1010,height=860');
  if (!win) return;
  const draftClass = isDraft ? ` ${DRAFT_WATERMARK_ATTR}` : '';
  win.document.write(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}${isDraft ? ' [DRAFT]' : ''}</title>` +
    `<style>${BASE_CSS}</style></head><body>${PRINT_BAR}<div class="page${draftClass}">${html}</div></body></html>`
  );
  win.document.close();
}

function logoHTML(s: CompanySettings, maxH = 65, maxW = 170): string {
  return s.logo_url
    ? `<img src="${s.logo_url}" style="max-height:${maxH}px;max-width:${maxW}px;object-fit:contain;display:block">`
    : `<div style="font-size:18px;font-weight:900;color:#000">${esc(s.company_name || '')}</div>`;
}

function footerHTML(s: CompanySettings): string {
  const email = s.email || '';
  return `
    <div style="text-align:center;margin-top:18px">
      ${s.logo_url ? `<img src="${s.logo_url}" style="max-height:55px;max-width:150px;object-fit:contain;display:block;margin:0 auto 4px">` : ''}
      <div style="font-size:10px;color:#333;margin-bottom:2px">If you have any questions or concerns, please contact</div>
      <div style="font-size:10px;color:#1155cc;margin-bottom:4px">${esc(email)}</div>
      <div style="font-size:11px;font-style:italic;font-weight:700">Thank You For Your Business!</div>
    </div>`;
}

// ─── Invoice ─────────────────────────────────────────────────────────────────

export function printInvoice(inv: Invoice, settings: CompanySettings, bank: BankAccount | null, isDraft = false) {
  void bank; // bank details shown in comments if needed
  const curr = inv.currency || 'USD';
  const custName = esc(inv.customer?.name || '');
  const custAddr  = esc((inv.customer as unknown as Record<string,unknown>)?.['address'] as string || '');
  const custPhone = esc((inv.customer as unknown as Record<string,unknown>)?.['phone'] as string || '');

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
          <div style="font-weight:700">${custName}</div>
          ${custAddr ? `<div style="font-size:10px">${custAddr}</div>` : ''}
          ${custPhone ? `<div style="font-size:10px">TELL: ${custPhone}</div>` : ''}
        </td>
        <td style="width:50%;vertical-align:top">
          <div style="font-size:10px;text-decoration:underline;margin-bottom:3px">SHIP TO:</div>
          <div style="font-weight:700">${custName}</div>
          ${custAddr ? `<div style="font-size:10px">${custAddr}</div>` : ''}
          ${custPhone ? `<div style="font-size:10px">TELL: ${custPhone}</div>` : ''}
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
          <th style="padding:7px 6px;text-align:right;width:14%;font-weight:700">Quantity<br>KG</th>
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
      <div style="font-weight:700;font-size:11px">TOTAL NET WEIGHT : ${fN3(inv.quantity_admt)} ADMT</div>
      ${inv.packing_info ? `<div style="font-weight:700;font-size:11px">TOTAL PACKING : ${esc(inv.packing_info)}</div>` : ''}
      ${inv.payment_terms ? `<div style="font-weight:700;font-size:11px">PAYMENT TERMS : ${esc(inv.payment_terms)}</div>` : ''}
    </div>

    <hr style="border:none;border-top:1px solid #aaa;margin:10px 0">

    ${footerHTML(settings)}
  `;

  openPrintWindow(body, `Invoice ${inv.invoice_no}`, isDraft);
}

// ─── Packing List ─────────────────────────────────────────────────────────────

export function printPackingList(pl: PackingList, settings: CompanySettings, isDraft = false) {
  const items = pl.packing_list_items ?? [];
  const isTruck = pl.transport_mode === 'truck';
  const isTrain = pl.transport_mode === 'train';
  const colLabel = isTruck ? 'TIR NO' : isTrain ? 'WAGON NO' : 'CONTAINER NO';

  const totReels = items.reduce((s, r) => s + (r.reels ?? 0), 0);
  const totAdmt  = items.reduce((s, r) => s + (r.admt ?? 0), 0);
  const totGross = items.reduce((s, r) => s + (r.gross_weight_kg ?? 0), 0);

  const plAny = pl as unknown as Record<string, unknown>;
  const tfAny = (pl.trade_file as unknown as Record<string, unknown> | null);
  const description = esc(pl.description || (tfAny?.['product'] as Record<string,unknown> | null)?.['name'] as string || '');
  const custName = esc((plAny?.['customer'] as Record<string,unknown> | null)?.['name'] as string || (tfAny?.['customer'] as Record<string,unknown> | null)?.['name'] as string || '');
  const custAddr = esc((plAny?.['customer'] as Record<string,unknown> | null)?.['address'] as string || '');
  const custPhone = esc((plAny?.['customer'] as Record<string,unknown> | null)?.['phone'] as string || '');

  const rowsHTML = items.map((r, i) => `
    <tr style="border-bottom:1px solid #ddd">
      <td style="padding:6px 6px;text-align:center">${i + 1}</td>
      <td style="padding:6px 6px">${esc(r.vehicle_plate || '')}</td>
      <td style="padding:6px 6px">${description}</td>
      <td style="padding:6px 6px;text-align:center">${r.reels ?? ''}</td>
      <td style="padding:6px 6px;text-align:right">${r.admt ? fN3(r.admt) : ''}</td>
      <td style="padding:6px 6px;text-align:right">${r.gross_weight_kg ? fN(r.gross_weight_kg, 0) : ''}</td>
    </tr>`).join('');

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
          <div style="font-size:30px;font-weight:700;color:#222;letter-spacing:1px">PACKING LIST</div>
          <div style="font-size:11px;margin-top:10px"><strong>DATE:</strong> ${fDate(pl.pl_date)}</div>
        </td>
      </tr>
    </table>

    <hr style="border:none;border-top:1px solid #999;margin:8px 0">

    <!-- ── Bill To / Ship To ── -->
    <table style="width:100%;margin-bottom:0">
      <tr>
        <td style="width:50%;padding-left:14%;vertical-align:top">
          <div style="font-size:10px;text-decoration:underline;margin-bottom:3px">BILL TO:</div>
          <div style="font-weight:700">${custName}</div>
          ${custAddr ? `<div style="font-size:10px">${custAddr}</div>` : ''}
          ${custPhone ? `<div style="font-size:10px">TELL: ${custPhone}</div>` : ''}
        </td>
        <td style="width:50%;vertical-align:top">
          <div style="font-size:10px;text-decoration:underline;margin-bottom:3px">SHIP TO:</div>
          <div style="font-weight:700">${custName}</div>
          ${custAddr ? `<div style="font-size:10px">${custAddr}</div>` : ''}
          ${custPhone ? `<div style="font-size:10px">TELL: ${custPhone}</div>` : ''}
        </td>
      </tr>
    </table>

    <!-- ── Meta row ── -->
    <table style="width:100%;border-top:1px solid #aaa;border-bottom:1px solid #aaa;margin:10px 0 0 0;font-size:10px">
      <tr>
        <td style="padding:4px 8px;font-weight:700;width:20%">CONTACT</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">INVOICE NO.</td>
        <td style="padding:4px 8px;font-weight:700;width:25%">CB NO.</td>
        <td style="padding:4px 8px;font-weight:700">INSURANCE NO.</td>
      </tr>
      <tr>
        <td style="padding:2px 8px 6px"></td>
        <td style="padding:2px 8px 6px;font-weight:700">${esc(pl.invoice_no || '')}</td>
        <td style="padding:2px 8px 6px">${esc(pl.cb_no || '')}</td>
        <td style="padding:2px 8px 6px">${esc(pl.insurance_no || '')}</td>
      </tr>
    </table>

    <!-- ── Item table ── -->
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px">
      <thead>
        <tr style="border-bottom:1px solid #333">
          <th style="padding:7px 6px;text-align:left;width:6%;font-weight:700">ITEM</th>
          <th style="padding:7px 6px;text-align:left;width:26%;font-weight:700">${colLabel}</th>
          <th style="padding:7px 6px;text-align:left;font-weight:700">DESCRIPTION</th>
          <th style="padding:7px 6px;text-align:center;width:10%;font-weight:700">Quantity<br>Reels</th>
          <th style="padding:7px 6px;text-align:right;width:11%;font-weight:700">ADMT</th>
          <th style="padding:7px 6px;text-align:right;width:14%;font-weight:700">Gross Weight<br>KG</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
      <tfoot>
        <tr style="border-top:1px solid #333">
          <td colspan="3" style="padding:6px 6px;text-align:right;font-weight:700">&nbsp;</td>
          <td style="padding:6px 6px;text-align:center;font-weight:700">${totReels}</td>
          <td style="padding:6px 6px;text-align:right;font-weight:700">${fN3(totAdmt)}</td>
          <td style="padding:6px 6px;text-align:right;font-weight:700">${fN(totGross, 0)}</td>
        </tr>
      </tfoot>
    </table>

    <hr style="border:none;border-top:1px solid #aaa;margin:4px 0 8px">

    <!-- ── Comments ── -->
    <div>
      <div style="font-weight:700;margin-bottom:5px">COMMENTS:</div>
      <div style="font-weight:700;font-size:11px">TOTAL GROSS WEIGHT : ${fN(totGross, 0)} KG</div>
      <div style="font-weight:700;font-size:11px">TOTAL NET WEIGHT : ${fN3(totAdmt)} ADMT</div>
      <div style="font-weight:700;font-size:11px">TOTAL PACKING : ${totReels} Reels</div>
      ${pl.comments ? pl.comments.split('\n').filter(Boolean).map(l => `<div style="font-weight:700;font-size:11px">${esc(l)}</div>`).join('') : ''}
    </div>

    <hr style="border:none;border-top:1px solid #aaa;margin:10px 0">

    ${footerHTML(settings)}
  `;

  openPrintWindow(body, `Packing List ${pl.packing_list_no}`, isDraft);
}

// ─── Proforma ────────────────────────────────────────────────────────────────

export function printProforma(
  pi: Proforma,
  settings: CompanySettings,
  bank: BankAccount | null,
  file?: TradeFile | null,
  isDraft = false,
) {
  const curr = pi.currency || 'USD';
  const piTfAny = (pi.trade_file as unknown as Record<string,unknown> | null);
  const customerRaw = file?.customer ?? (piTfAny?.['customer'] as Record<string,unknown> | null) ?? null;
  const customerAny = customerRaw as unknown as Record<string,unknown> | null;
  const custName    = esc(customerAny?.['name'] as string ?? '');
  const custAddr    = esc(customerAny?.['address'] as string ?? '');
  const custCountry = esc(customerAny?.['country'] as string ?? '');
  const custPhone   = esc(customerAny?.['phone'] as string ?? '');

  const bankBlock = bank
    ? `${esc(bank.bank_name || '')}${bank.swift_bic ? ' SWIFT: ' + esc(bank.swift_bic) : ''}<br>` +
      `${bank.iban_usd ? 'IBAN USD: ' + esc(bank.iban_usd) + '<br>' : ''}` +
      `${bank.iban_eur ? 'IBAN EUR: ' + esc(bank.iban_eur) + '<br>' : ''}` +
      `${bank.correspondent_bank ? esc(bank.correspondent_bank) : ''}`
    : '';

  const notes = (pi.notes || '').split('\n').filter((l: string) => l.trim());
  const notesHTML = notes.map((l: string, i: number) => `<div style="margin-bottom:3px">${i + 1 > 0 ? i + 1 : ''}- ${esc(l)}</div>`).join('');

  const th = (content: string, extra = '') =>
    `<td style="border:1px solid #888;padding:3px 6px;font-size:9px;color:#555;vertical-align:top${extra ? ';' + extra : ''}">${content}</td>`;

  const partialText = pi.partial_shipment === 'not'
    ? '(x) not allowed &nbsp; ( ) allowed'
    : '( ) not allowed &nbsp; (x) allowed';

  const body = `
    <!-- ── Header ── -->
    <table style="width:100%;margin-bottom:8px">
      <tr>
        <td style="width:40%;vertical-align:top">
          ${logoHTML(settings, 65, 170)}
        </td>
        <td style="text-align:right;vertical-align:top">
          <div style="font-size:26px;font-weight:300;color:#888">Commercial Invoice</div>
        </td>
      </tr>
    </table>

    <!-- ── Main grid table ── -->
    <table style="width:100%;border-collapse:collapse;font-size:10.5px">

      <!-- Row 1: ISSUER | Proforma Invoice Number -->
      <tr>
        ${th('ISSUER (name, address):', 'width:52%')}
        ${th('Proforma Invoice Number: <strong style="color:#c0392b;font-size:11px">' + esc(pi.proforma_no) + '</strong>')}
      </tr>
      <tr>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10.5px;vertical-align:top">
          <strong>${esc(settings.company_name || '')}</strong><br>
          ${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}<br>
          ${settings.email ? 'Website: www.pluskimya.com &nbsp; Mail: ' + esc(settings.email) : ''}
        </td>
        <td style="border:1px solid #888;padding:0;vertical-align:top">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              ${th('Proforma Invoice Date', 'width:50%;border-right:1px solid #bbb;border-bottom:1px solid #bbb')}
              ${th('Validity date/days of PI', 'border-bottom:1px solid #bbb')}
            </tr>
            <tr>
              <td style="padding:3px 6px;font-weight:700;border-right:1px solid #bbb;font-size:10.5px">${fDate(pi.proforma_date)}</td>
              <td style="padding:3px 6px;font-weight:700;font-size:10.5px">${pi.validity_date ? fDate(pi.validity_date) : '—'}</td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- Row 2: Buyer ref -->
      <tr>
        <td colspan="2" style="border:1px solid #888;padding:2px 6px;font-size:9px;color:#555">
          Buyer's reference / Buyer Commercial ID No.: <span style="color:#000;font-size:10px">${esc(pi.buyer_commercial_id || '')}</span>
        </td>
      </tr>

      <!-- Row 3: Shipper | Consignee -->
      <tr>
        ${th('Shipper (name, address):')}
        ${th('Consignee (name, address):')}
      </tr>
      <tr>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10.5px;vertical-align:top">
          <strong>${esc(settings.company_name || '')}</strong><br>
          ${esc(settings.address_line1 || '')}${settings.address_line2 ? ', ' + esc(settings.address_line2) : ''}<br>
          ${settings.email ? 'Website: www.pluskimya.com &nbsp; Mail: ' + esc(settings.email) : ''}
        </td>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10.5px;vertical-align:top">
          <strong>${custName}</strong><br>
          ${custAddr ? custAddr + '<br>' : ''}
          ${custCountry ? custCountry + '<br>' : ''}
          ${custPhone ? 'Tel: ' + custPhone : ''}
        </td>
      </tr>

      <!-- Row 4: Bankers | Country of beneficiary -->
      <tr>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <span style="font-size:9px;color:#555">Bankers details:</span><br>
          ${bankBlock}
        </td>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <div><span style="font-size:9px;color:#555">Country of beneficiary:</span> TURKEY</div>
          <div style="margin-top:3px"><span style="font-size:9px;color:#555">Country of origin:</span> ${esc(pi.country_of_origin || '')} &nbsp;&nbsp; <span style="font-size:9px;color:#555">Country of destination:</span> ${custCountry}</div>
        </td>
      </tr>

      <!-- Row 5: Partial shipment | Terms -->
      <tr>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <span style="font-size:9px;color:#555">Partial shipment:</span><br>${partialText}
        </td>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <span style="font-size:9px;color:#555">Terms of delivery:</span> <strong>${esc(pi.incoterms || '')}</strong><br>
          <span style="font-size:9px;color:#555">Terms of payment:</span> ${esc(pi.payment_terms || '')}
        </td>
      </tr>

      <!-- Row 6: Transport | Place of payment -->
      <tr>
        <td style="border:1px solid #888;padding:0;vertical-align:top">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:2px 5px;border-right:1px solid #bbb;font-size:9px;color:#555;width:50%">Transport mode and means:</td>
              <td style="padding:2px 5px;font-size:9px;color:#555">Port / Airport of loading:</td>
            </tr>
            <tr>
              <td style="padding:2px 5px;border-right:1px solid #bbb;font-size:10.5px">${esc(pi.transport_mode || '')}</td>
              <td style="padding:2px 5px;font-size:10.5px">${esc(pi.port_of_loading || '')}</td>
            </tr>
          </table>
        </td>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <span style="font-size:9px;color:#555">Place of payment:</span> ${esc(pi.place_of_payment || '')}<br>
          <span style="font-size:9px;color:#555">Time of Delivery :</span> -
        </td>
      </tr>

      <!-- Row 7: Port of discharge | Transaction currency -->
      <tr>
        <td style="border:1px solid #888;padding:0;vertical-align:top">
          <table style="width:100%;border-collapse:collapse">
            <tr>
              <td style="padding:2px 5px;border-right:1px solid #bbb;font-size:9px;color:#555;width:50%">Port / Airport of discharge:</td>
              <td style="padding:2px 5px;font-size:9px;color:#555">Final place delivery:</td>
            </tr>
            <tr>
              <td style="padding:2px 5px;border-right:1px solid #bbb;font-size:10.5px">${esc(pi.port_of_discharge || '')}</td>
              <td style="padding:2px 5px;font-size:10.5px">${esc(pi.final_delivery || pi.port_of_discharge || '')}</td>
            </tr>
          </table>
        </td>
        <td style="border:1px solid #888;padding:3px 6px;font-size:10px;vertical-align:top">
          <span style="font-size:9px;color:#555">Transaction currency:</span> <strong>${curr}</strong><br>
          <span style="font-size:9px;color:#555">Insurance:</span> ${esc(pi.insurance || 'INSURANCE TO BE ARRANGED BY BUYER')}
        </td>
      </tr>

      <!-- Row 8: Item table header -->
      <tr>
        <td colspan="2" style="padding:0;border:1px solid #888">
          <table style="width:100%;border-collapse:collapse;font-size:10.5px">
            <thead>
              <tr style="background:#d4d4d4">
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:5%">Item</th>
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:22%">Item description</th>
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:12%">Total net<br>wt (KG)</th>
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:12%">Total Gross<br>wt (KG)</th>
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:10%">Quantity<br>ADMT</th>
                <th style="padding:5px 6px;border-right:1px solid #888;text-align:center;width:12%">Unit price<br>${curr}</th>
                <th style="padding:5px 6px;text-align:center;width:12%">Amount<br>${curr}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center">1</td>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center;font-weight:700">${esc(pi.description || '')}</td>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center">${pi.net_weight_kg ? fN3(pi.net_weight_kg) : ''}</td>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center">${pi.gross_weight_kg ? fN3(pi.gross_weight_kg) : ''}</td>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center;font-weight:700">${fN3(pi.quantity_admt)}</td>
                <td style="padding:6px;border-right:1px solid #ccc;border-top:1px solid #ccc;text-align:center">${tF(pi.unit_price)}</td>
                <td style="padding:6px;border-top:1px solid #ccc;text-align:center;font-weight:700">${tF(pi.subtotal)}</td>
              </tr>
            </tbody>
          </table>
        </td>
      </tr>

      <!-- Row 9: Notes | Totals -->
      <tr style="vertical-align:top">
        <td style="border:1px solid #888;padding:5px 7px;font-size:9.5px;line-height:1.7;vertical-align:top">
          <strong>Note:</strong><br>${notesHTML}
        </td>
        <td style="border:1px solid #888;padding:0;vertical-align:top">
          <table style="width:100%;border-collapse:collapse;font-size:10.5px">
            <tr><td colspan="2" style="padding:3px 8px;border-bottom:1px solid #ccc;font-size:9px;color:#555">Total amoumt:</td></tr>
            <tr><td colspan="2" style="padding:4px 8px;border-bottom:1px solid #ccc;text-align:center;font-weight:700;font-size:13px">${curr}&nbsp;${tF(pi.subtotal)}</td></tr>
            <tr>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;font-size:9.5px;color:#555">Discount:</td>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;text-align:right">${(pi.discount ?? 0) > 0 ? '-' + tF(pi.discount) : 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;font-size:9.5px;color:#555">Freght Charges:</td>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;text-align:right">${(pi.freight ?? 0) > 0 ? tF(pi.freight) : 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;font-size:9.5px;color:#555">Other Charges:</td>
              <td style="padding:3px 8px;border-bottom:1px solid #ccc;text-align:right">${(pi.other_charges ?? 0) > 0 ? tF(pi.other_charges) : 'N/A'}</td>
            </tr>
            <tr><td colspan="2" style="padding:2px 8px;border-bottom:1px solid #ccc;font-size:9px;color:#555">Total Amount:</td></tr>
            <tr><td colspan="2" style="padding:5px 8px;text-align:center;font-weight:700;font-size:13px;background:#e8e8e8">${curr}&nbsp;${tF(pi.total)}</td></tr>
          </table>
        </td>
      </tr>

      <!-- Row 10: Certification | Signatory -->
      <tr style="vertical-align:top">
        <td style="border:1px solid #888;padding:6px 8px;font-size:9.5px;font-style:italic;line-height:1.6;vertical-align:top">
          It is hereby certified that this invoice shows the actual price of the goods described,
          that no other invoice has been or will be issued, and that all praticulars are true and correct.
        </td>
        <td style="border:1px solid #888;padding:5px 8px;font-size:10.5px;vertical-align:top">
          <div>NAME OF SIGNATORY: <strong>${esc(pi.signatory || settings.signatory || '')}</strong></div>
          <div style="margin-top:3px">PLACE AND DATE OF ISSUE:</div>
          <div style="font-size:10px;margin-top:2px">TURKEY &nbsp; ${fDate(pi.proforma_date)}</div>
          <div style="margin-top:3px">SEAL AND SIGNATURE:</div>
          ${settings.logo_url ? `<img src="${settings.logo_url}" style="max-height:45px;max-width:120px;object-fit:contain;display:block;margin-top:4px">` : ''}
        </td>
      </tr>

    </table>

    <!-- ── Footer ── -->
    <div style="text-align:center;margin-top:16px;border-top:1px solid #aaa;padding-top:8px">
      <div style="font-size:10px;color:#333">
        ${esc(settings.address_line1 || '')}${settings.address_line2 ? ' ' + esc(settings.address_line2) : ''}
      </div>
      <div style="font-size:10px;color:#333;margin-top:2px">
        ${settings.phone ? 'WWW.PLUSKIMYA.COM &nbsp; ' : ''}${settings.email ? esc(settings.email).toUpperCase() : ''}
      </div>
    </div>
  `;

  openPrintWindow(body, `Proforma Invoice ${pi.proforma_no}`, isDraft);
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

    ${txn.notes ? `
    <!-- Notes -->
    <div style="border:1px solid #ddd;padding:8px 12px;border-radius:4px;font-size:10px;color:#555;margin-bottom:18px">
      <strong>Notes:</strong> ${esc(txn.notes)}
    </div>` : ''}

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

  openPrintWindow(body, `${title} - ${docNo}`, isDraft);
}

// ─── Transaction Invoice (purchase_inv / svc_inv / sale_inv) ─────────────────

export function printTransactionInvoice(txn: Transaction, settings: CompanySettings, isDraft = false) {
  const TYPE_TITLES: Record<string, string> = {
    purchase_inv: 'PURCHASE INVOICE',
    svc_inv:      'SERVICE INVOICE',
    sale_inv:     'SALE INVOICE',
  };
  const title = TYPE_TITLES[txn.transaction_type] ?? 'INVOICE';
  const docNo = txn.reference_no || txn.id.slice(0, 8).toUpperCase();
  const curr  = txn.currency ?? 'USD';
  const party = txn.customer?.name || txn.supplier?.name || txn.service_provider?.name || txn.party_name || '—';
  const partyLabel = txn.transaction_type === 'sale_inv' ? 'Bill To' : 'From';
  const fileNo = txn.trade_file?.file_no ?? '';

  const body = `
    <!-- Header -->
    <table style="width:100%;margin-bottom:20px">
      <tr>
        <td style="width:55%;vertical-align:top">
          ${logoHTML(settings, 60, 160)}
          <div style="margin-top:6px;font-size:10px;color:#555;line-height:1.7">
            ${esc(settings.company_name || '')}<br>
            ${esc(settings.address_line1 || '')}
            ${settings.address_line2 ? '<br>' + esc(settings.address_line2) : ''}
            ${settings.phone ? '<br>' + esc(settings.phone) : ''}
            ${settings.email ? '<br>' + esc(settings.email) : ''}
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
          </table>
        </td>
      </tr>
    </table>

    <div style="border-top:2px solid #111;margin-bottom:16px"></div>

    <!-- Party -->
    <div style="margin-bottom:16px;padding:10px 14px;border:1px solid #ddd;background:#f9f9f9;border-radius:4px">
      <div style="font-size:9px;color:#999;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">${partyLabel}</div>
      <div style="font-size:13px;font-weight:700">${esc(party)}</div>
    </div>

    <!-- Items Table -->
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:16px">
      <thead>
        <tr style="background:#111;color:#fff">
          <th style="padding:8px 10px;text-align:left">#</th>
          <th style="padding:8px 10px;text-align:left">Description</th>
          <th style="padding:8px 10px;text-align:right;width:140px">Amount (${curr})</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:9px 10px;border-bottom:1px solid #eee">1</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eee">${esc(txn.description || '—')}</td>
          <td style="padding:9px 10px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${tF(txn.amount)}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr style="background:#f3f4f6">
          <td colspan="2" style="padding:9px 10px;text-align:right;font-weight:700;border-top:2px solid #ddd">TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:900;font-size:13px;border-top:2px solid #ddd">
            ${curr} ${tF(txn.amount)}
          </td>
        </tr>
        ${txn.paid_amount > 0 ? `
        <tr>
          <td colspan="2" style="padding:6px 10px;text-align:right;color:#16a34a;font-weight:600">Paid</td>
          <td style="padding:6px 10px;text-align:right;color:#16a34a;font-weight:700">- ${curr} ${tF(txn.paid_amount)}</td>
        </tr>
        <tr style="background:#fef9c3">
          <td colspan="2" style="padding:8px 10px;text-align:right;font-weight:700">Balance Due</td>
          <td style="padding:8px 10px;text-align:right;font-weight:900;font-size:13px;color:#dc2626">
            ${curr} ${tF(txn.amount - txn.paid_amount)}
          </td>
        </tr>` : ''}
      </tfoot>
    </table>

    ${txn.notes ? `
    <div style="border:1px solid #ddd;padding:8px 12px;border-radius:4px;font-size:10px;color:#555;margin-bottom:16px">
      <strong>Notes:</strong> ${esc(txn.notes)}
    </div>` : ''}

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

  openPrintWindow(body, `${title} - ${docNo}`, isDraft);
}
