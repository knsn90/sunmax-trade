/**
 * pdfExport.ts
 * Converts document HTML to a base64-encoded PDF using html2pdf.js.
 * Accepts either:
 *   - Raw body HTML (tables/content) → wraps in .page div
 *   - Full HTML page (from generate*Html functions) → extracts .page content first
 */

// 10mm padding — matches @media print CSS so layout is identical to browser print
const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    background: #fff;
    color: #000;
    margin: 0;
    padding: 0;
  }
  table { border-collapse: collapse; }
  td, th { font-size: 11px; }
  .page {
    background: #fff;
    width: 210mm;
    padding: 10mm;
    position: relative;
  }
  .draft-watermark { position: relative; }
  .draft-watermark::before {
    content: 'DRAFT';
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) rotate(-45deg);
    font-size: 140px;
    font-weight: 900;
    color: rgba(0,0,0,0.05);
    letter-spacing: 20px;
    pointer-events: none;
    z-index: 9999;
    white-space: nowrap;
    user-select: none;
  }
`;

/**
 * Fetches all <img> src attributes and replaces them with base64 data URLs.
 * This bypasses CORS restrictions in html2canvas by inlining images.
 */
async function inlineImages(html: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img[src]'));

  await Promise.all(
    imgs.map(async (img) => {
      let src = img.getAttribute('src') ?? '';
      if (!src || src.startsWith('data:')) return;
      // Resolve relative URLs against current origin
      try {
        src = new URL(src, window.location.href).href;
      } catch {
        return;
      }
      try {
        const resp = await fetch(src, { cache: 'force-cache' });
        if (!resp.ok) return;
        const blob = await resp.blob();
        const b64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(blob);
        });
        img.setAttribute('src', b64);
      } catch {
        // Leave original src — html2canvas will try with useCORS
      }
    }),
  );

  return doc.documentElement.outerHTML;
}

export async function htmlBodyToPdfBase64(rawHtml: string, _isDraft = false): Promise<string> {
  const html2pdf = (await import('html2pdf.js')).default;

  // If a full HTML page was passed (generate*Html returns buildFullHtml output),
  // extract just the .page innerHTML so we don't embed the sidebar in the PDF.
  // Note: isDraft is always forced to false — Dropbox PDFs are always "clean"
  // (no watermark, footer shows seal). Draft status only affects browser print.
  let bodyHtml = rawHtml;
  const trimmed = rawHtml.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const page = doc.querySelector('.page');
    if (page) {
      // Remove draft watermark class so CSS ::before pseudo-element doesn't fire
      page.classList.remove('draft-watermark');

      // Swap footer logo → seal for clean Dropbox PDF.
      // invoiceHTML / packingListHTML render footerHTML(settings, !isDraft):
      //   isDraft=true  → showSeal=false → logo <img> in footer div
      //   isDraft=false → showSeal=true  → seal <img> in footer div
      // Since the preview was opened as draft we must swap the logo for the seal.
      const SEAL_SRC = '/seal-signature.svg';
      const SEAL_STYLE = 'display:block;max-width:230px;max-height:110px;object-fit:contain;margin:4px auto 0';
      page.querySelectorAll('div').forEach((div) => {
        const style = div.getAttribute('style') ?? '';
        // Target the footer centred div created by footerHTML()
        if (style.includes('text-align:center') && style.includes('margin-top:18px')) {
          div.querySelectorAll('img').forEach((img) => {
            const src = img.getAttribute('src') ?? '';
            if (!src.includes('seal-signature')) {
              img.setAttribute('src', SEAL_SRC);
              img.setAttribute('style', SEAL_STYLE);
            }
          });
        }
      });

      bodyHtml = page.innerHTML;
    }
  }

  // Always render clean (no DRAFT watermark, seal in footer)
  const draftClass = '';

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>${PAGE_CSS}</style>
</head>
<body>
  <div class="page${draftClass}">
    ${bodyHtml}
  </div>
</body>
</html>`;

  // Inline all images as base64 data URLs to avoid CORS issues in html2canvas
  const inlinedHtml = await inlineImages(fullHtml);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker = html2pdf() as any;
  const blob: Blob = await worker
    .set({
      margin: 0,
      filename: 'document.pdf',
      image: { type: 'jpeg', quality: 0.82 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        // 210mm at 96dpi = ~794px — matches .page width: 210mm
        windowWidth: 794,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(inlinedHtml, 'string')
    .outputPdf('blob');

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
