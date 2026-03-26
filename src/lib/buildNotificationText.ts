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
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

const MODE: Record<string, string> = { truck: 'Truck', railway: 'Railway', sea: 'Sea' };

export function buildNotificationText(group: NotifGroup, ctx: NotifContext): string {
  const date  = fmtDate(ctx.loadingDate);
  const mode  = MODE[ctx.transportMode] ?? ctx.transportMode;
  const list  = ctx.plates.map((p, i) => `${i + 1}. ${p}`).join('\n');
  const count = ctx.plates.length;

  switch (group) {
    case 'customs':
      return [
        `📋 CUSTOMS NOTIFICATION`,
        `File No  : ${ctx.fileNo}`,
        `Product  : ${ctx.productName}`,
        `Loading  : ${date}  |  ${mode}`,
        ctx.freightCompany ? `Freight  : ${ctx.freightCompany}` : '',
        ``,
        `Customs procedures will be initiated for the following vehicles:`,
        list,
        ``,
        `Total: ${count} vehicle(s)`,
      ].filter(l => l !== null && l !== undefined && !(l === '' && false)).join('\n').trim();

    case 'warehouse':
      return [
        `📦 WAREHOUSE NOTIFICATION`,
        `File No  : ${ctx.fileNo}`,
        `Product  : ${ctx.productName}`,
        `Loading  : ${date}`,
        ``,
        `Please prepare goods for the following vehicles:`,
        list,
        ``,
        `Total: ${count} vehicle(s)`,
      ].join('\n').trim();

    case 'port':
      return [
        `🚢 PORT NOTIFICATION`,
        `File No  : ${ctx.fileNo}`,
        `Product  : ${ctx.productName}`,
        `Loading  : ${date}`,
        ctx.portOfLoading ? `Port     : ${ctx.portOfLoading}` : '',
        ``,
        `Vehicle Plates (${count}):`,
        list,
      ].filter(l => l !== null).join('\n').trim();

    case 'company':
      return [
        `🏢 COMPANY GROUP NOTIFICATION`,
        `File No  : ${ctx.fileNo}`,
        `Product  : ${ctx.productName}`,
        ctx.freightCompany ? `Freight  : ${ctx.freightCompany}` : '',
        `Loading  : ${date}  |  ${mode}`,
        ``,
        `Vehicles (${count}):`,
        list,
      ].filter(l => l !== null).join('\n').trim();
  }
}
