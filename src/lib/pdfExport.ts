/**
 * pdfExport.ts
 * Converts document HTML to a base64-encoded PDF using html2pdf.js.
 * Accepts either:
 *   - Raw body HTML (tables/content) → wraps in .page div
 *   - Full HTML page (from generate*Html functions) → extracts .page content first
 */

const PAGE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Arial, sans-serif;
    font-size: 11px;
    background: #fff;
    color: #000;
  }
  table { border-collapse: collapse; }
  td, th { font-size: 11px; }
  .page {
    background: #fff;
    width: 210mm;
    padding: 14mm 14mm 12mm 14mm;
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
    color: rgba(0,0,0,0.06);
    letter-spacing: 20px;
    pointer-events: none;
    z-index: 9999;
    white-space: nowrap;
    user-select: none;
  }
`;

export async function htmlBodyToPdfBase64(rawHtml: string, isDraft = false): Promise<string> {
  const html2pdf = (await import('html2pdf.js')).default;

  // If a full HTML page was passed (generate*Html returns buildFullHtml output),
  // extract just the .page innerHTML so we don't embed the sidebar in the PDF.
  let bodyHtml = rawHtml;
  const trimmed = rawHtml.trimStart();
  if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const page = doc.querySelector('.page');
    if (page) {
      if (page.classList.contains('draft-watermark')) isDraft = true;
      bodyHtml = page.innerHTML;
    }
  }

  const draftClass = isDraft ? ' draft-watermark' : '';

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const worker = html2pdf() as any;
  const blob: Blob = await worker
    .set({
      margin: 0,
      filename: 'document.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 794,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    })
    .from(fullHtml, 'string')
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
