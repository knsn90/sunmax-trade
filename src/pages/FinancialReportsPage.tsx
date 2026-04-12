import { useState } from 'react';
import { cn } from '@/lib/utils';
import { PnlReportTab, AccountStatementTab, CustomerReportTab } from '@/pages/ReportsPage';
import { FinancialReportsTab } from '@/components/accounting/FinancialReportsTab';
import { FxReportTab } from '@/components/accounting/FxReportTab';

type FinTab = 'trade_pnl' | 'cari' | 'customer_report' | 'kasa_banka' | 'kur_farki';

const TABS: { key: FinTab; label: string }[] = [
  { key: 'trade_pnl',       label: 'Kar/Zarar Raporu' },
  { key: 'cari',            label: 'Hesap Ekstresi' },
  { key: 'customer_report', label: 'Müşteri Raporu' },
  { key: 'kasa_banka',      label: 'Kasa ve Banka' },
  { key: 'kur_farki',       label: 'Kur Farkı' },
];

export function FinancialReportsPage() {
  const [activeTab, setActiveTab] = useState<FinTab>('trade_pnl');

  return (
    <div className="space-y-5">

      {/* Tab bar — kapsül stili */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-2xl overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 px-3.5 h-8 rounded-xl text-[11px] font-semibold transition-all whitespace-nowrap outline-none',
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        {activeTab === 'trade_pnl'       && <PnlReportTab />}
        {activeTab === 'cari'            && <AccountStatementTab />}
        {activeTab === 'customer_report' && <CustomerReportTab />}
        {activeTab === 'kasa_banka'      && <FinancialReportsTab />}
        {activeTab === 'kur_farki'       && <FxReportTab />}
      </div>

    </div>
  );
}
