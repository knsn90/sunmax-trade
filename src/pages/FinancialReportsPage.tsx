import { useSearchParams } from 'react-router-dom';
import { BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PnlReportTab, PeriodPnlTab, StockTab, AccountStatementTab, CustomerReportTab } from '@/pages/ReportsPage';
import { FinancialReportsTab } from '@/components/accounting/FinancialReportsTab';
import { FxReportTab } from '@/components/accounting/FxReportTab';

type FinTab = 'trade_pnl' | 'donem_pnl' | 'stok' | 'cari' | 'customer_report' | 'kasa_banka' | 'kur_farki';

const TABS: { key: FinTab; label: string }[] = [
  { key: 'trade_pnl',       label: 'Kar/Zarar Raporu' },
  { key: 'donem_pnl',       label: 'Dönem Kâr/Zarar' },
  { key: 'stok',            label: 'Stok' },
  { key: 'cari',            label: 'Hesap Ekstresi' },
  { key: 'customer_report', label: 'Müşteri Raporu' },
  { key: 'kasa_banka',      label: 'Kasa ve Banka' },
  { key: 'kur_farki',       label: 'Kur Farkı' },
];

export function FinancialReportsPage() {
  // Aktif sekmeyi URL'de tut (?tab=...) → refresh'te ilk sekmeye dönmez, paylaşılabilir
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: FinTab = TABS.some((t) => t.key === tabParam) ? (tabParam as FinTab) : 'trade_pnl';
  const setActiveTab = (key: FinTab) => {
    setSearchParams((prev) => { prev.set('tab', key); return prev; }, { replace: true });
  };

  return (
    <div className="space-y-5" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>

      {/* Page Header */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-white border border-[#ECECEC] shadow-[0_8px_24px_rgba(0,0,0,0.04)] flex items-center justify-center">
          <BarChart2 style={{ width: 20, height: 20 }} className="text-[#8A8A8E]" />
        </div>
        <div>
          <h1 className="text-[22px] font-bold text-[#0A0A0A] tracking-[-0.02em] leading-tight">Finansal Raporlar</h1>
          <p className="text-[13px] text-[#8A8A8E] mt-0.5">Kar/zarar, hesap ekstresi ve kur farkı analizleri</p>
        </div>
      </div>

      {/* Tab bar — kapsül stili */}
      <div className="flex gap-1 bg-[#EAE7E0] p-1 rounded-full overflow-x-auto scrollbar-none w-fit max-w-full">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 px-4 h-8 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap outline-none',
              activeTab === tab.key
                ? 'bg-white text-[#0A0A0A] shadow-sm'
                : 'text-[#8A8A8E] hover:text-[#0A0A0A]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'trade_pnl'       && <PnlReportTab />}
        {activeTab === 'donem_pnl'       && <PeriodPnlTab />}
        {activeTab === 'stok'            && <StockTab />}
        {activeTab === 'cari'            && <AccountStatementTab />}
        {activeTab === 'customer_report' && <CustomerReportTab />}
        {activeTab === 'kasa_banka'      && <FinancialReportsTab />}
        {activeTab === 'kur_farki'       && <FxReportTab />}
      </div>

    </div>
  );
}
