export type NotifGroup = 'customs' | 'warehouse' | 'port' | 'company';

export interface NotifContext {
  fileNo: string;
  productName: string;
  loadingDate: string | null;
  plates: string[];           // active/changed plates (replacement shown)
  freightCompany: string;
  portOfLoading: string | null;
  transportMode: string;
}

function fmtDate(iso: string | null) {
  if (!iso) return 'TBD';
  return new Date(iso + 'T00:00:00').toLocaleDateString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

const MODE: Record<string, string> = { truck: 'Tır', railway: 'Tren', sea: 'Deniz' };

export function buildNotificationText(group: NotifGroup, ctx: NotifContext): string {
  const date  = fmtDate(ctx.loadingDate);
  const mode  = MODE[ctx.transportMode] ?? ctx.transportMode;
  const list  = ctx.plates.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const count = ctx.plates.length;

  switch (group) {
    case 'customs':
      return [
        `📋 GÜMRÜK BİLDİRİMİ`,
        `Dosya No : ${ctx.fileNo}`,
        `Ürün     : ${ctx.productName}`,
        `Yükleme  : ${date}  |  ${mode}`,
        ctx.freightCompany ? `Navlun   : ${ctx.freightCompany}` : '',
        ``,
        `Aşağıdaki araçlar için gümrük işlemleri başlatılacaktır:`,
        list,
        ``,
        `Toplam: ${count} araç`,
      ].filter(l => l !== null && l !== undefined && !(l === '' && false)).join('\n').trim();

    case 'warehouse':
      return [
        `📦 ANTREPO BİLDİRİMİ`,
        `Dosya No : ${ctx.fileNo}`,
        `Ürün     : ${ctx.productName}`,
        `Yükleme  : ${date}`,
        ``,
        `Aşağıdaki araçlar için malzeme hazırlığı rica olunur:`,
        list,
        ``,
        `Toplam: ${count} araç`,
      ].join('\n').trim();

    case 'port':
      return [
        `🚢 LİMAN BİLDİRİMİ`,
        `Dosya No : ${ctx.fileNo}`,
        `Ürün     : ${ctx.productName}`,
        `Yükleme  : ${date}`,
        ctx.portOfLoading ? `Liman    : ${ctx.portOfLoading}` : '',
        ``,
        `Araç Plakaları (${count} adet):`,
        list,
      ].filter(l => l !== null).join('\n').trim();

    case 'company':
      return [
        `🏢 FİRMA GRUBU BİLDİRİMİ`,
        `Dosya No : ${ctx.fileNo}`,
        `Ürün     : ${ctx.productName}`,
        ctx.freightCompany ? `Navlun   : ${ctx.freightCompany}` : '',
        `Yükleme  : ${date}  |  ${mode}`,
        ``,
        `Araçlar (${count} adet):`,
        list,
      ].filter(l => l !== null).join('\n').trim();
  }
}
