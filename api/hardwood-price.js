/**
 * Vercel Serverless Function — /api/hardwood-price
 * Scrapes China Wood Pulp (Hardwood) spot price from sunsirs.com
 * Returns: { price: number (CNY), date: string }
 *
 * Cached by Vercel edge for 6 hours (s-maxage=21600)
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=43200');

  const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const URL = 'https://www.sunsirs.com/uk/prodetail-958.html';

  try {
    // ── Step 1: hit page to get anti-bot cookie value from inline JS ──
    const step1 = await fetch(URL, { headers: { 'User-Agent': UA } });
    const html1 = await step1.text();

    let html2 = html1;

    const cookieMatch = html1.match(/var _0x2 = "([a-f0-9]+)"/);
    if (cookieMatch) {
      // ── Step 2: retry with cookie ──
      const step2 = await fetch(URL, {
        headers: { 'User-Agent': UA, Cookie: `HW_CHECK=${cookieMatch[1]}` },
      });
      html2 = await step2.text();
    }

    // Parse table rows: <td>4550.00</td><td>2026-03-22</td>
    const re = /<td>(\d{3,6}\.\d{2})<\/td><td>(\d{4}-\d{2}-\d{2})<\/td>/g;
    const matches = [...html2.matchAll(re)];

    if (!matches.length) {
      return res.status(502).json({ error: 'Price not found in page' });
    }

    // First match is the most recent date
    const price = parseFloat(matches[0][1]);
    const date  = matches[0][2];

    return res.json({ price, currency: 'CNY', date });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
