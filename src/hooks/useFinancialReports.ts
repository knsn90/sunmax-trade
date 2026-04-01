import { useQuery } from '@tanstack/react-query';
import { financialReportsService } from '@/services/financialReportsService';

export function useTrialBalance(dateFrom?: string, dateTo?: string, enabled = true) {
  return useQuery({
    queryKey: ['financial-reports', 'trial-balance', dateFrom, dateTo],
    queryFn: () => financialReportsService.trialBalance(dateFrom, dateTo),
    enabled,
  });
}

export function useProfitLoss(dateFrom?: string, dateTo?: string, enabled = true) {
  return useQuery({
    queryKey: ['financial-reports', 'profit-loss', dateFrom, dateTo],
    queryFn: () => financialReportsService.profitLoss(dateFrom, dateTo),
    enabled,
  });
}

export function useBalanceSheet(asOf?: string, enabled = true) {
  return useQuery({
    queryKey: ['financial-reports', 'balance-sheet', asOf],
    queryFn: () => financialReportsService.balanceSheet(asOf),
    enabled,
  });
}
