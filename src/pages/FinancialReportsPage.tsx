import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/contexts/ThemeContext';
import { TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PnlReportTab, AccountStatementTab, CustomerReportTab } from '@/pages/ReportsPage';
import { FinancialReportsTab } from '@/components/accounting/FinancialReportsTab';
import { FxReportTab } from '@/components/accounting/FxReportTab';

type FinTab = 'trade_pnl' | 'cari' | 'customer_report' | 'kasa_banka' | 'kur_farki';

export function FinancialReportsPage() {
  const { theme } = useTheme();
  const { t } = useTranslation('finReports');
  const accent = theme === 'donezo' ? '#dc2626' : '#2563eb';

  const [activeTab, setActiveTab] = useState<FinTab>('trade_pnl');

  const TABS: { key: FinTab; label: string }[] = [
    { key: 'trade_pnl',       label: 'Kar/Zarar Raporu' },
    { key: 'cari',            label: 'Hesap Ekstresi' },
    { key: 'customer_report', label: 'Müşteri Raporu' },
    { key: 'kasa_banka',      label: 'Kasa ve Banka' },
    { key: 'kur_farki',       label: 'Kur Farkı' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: accent + '18' }}>
          <TrendingUp className="w-5 h-5" style={{ color: accent }} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>
          <p className="text-xs text-gray-400">{t('description')}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-none">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'shrink-0 px-4 py-2.5 text-[12px] font-semibold transition-all border-b-2 -mb-px whitespace-nowrap',
              activeTab === tab.key ? 'text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50',
            )}
            style={activeTab === tab.key ? { borderBottomColor: accent, color: accent } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'trade_pnl'       && <PnlReportTab />}
      {activeTab === 'cari'            && <AccountStatementTab />}
      {activeTab === 'customer_report' && <CustomerReportTab />}
      {activeTab === 'kasa_banka'      && <FinancialReportsTab />}
      {activeTab === 'kur_farki'       && <FxReportTab />}
    </div>
  );
}
