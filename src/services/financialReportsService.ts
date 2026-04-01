import { supabase } from './supabase';
import type { TrialBalanceRow, ProfitLossRow, BalanceSheetRow } from '@/types/database';

export const financialReportsService = {
  async trialBalance(dateFrom?: string, dateTo?: string): Promise<TrialBalanceRow[]> {
    const { data, error } = await supabase.rpc('fn_trial_balance', {
      p_from: dateFrom ?? null,
      p_to:   dateTo   ?? null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as TrialBalanceRow[];
  },

  async profitLoss(dateFrom?: string, dateTo?: string): Promise<ProfitLossRow[]> {
    const { data, error } = await supabase.rpc('fn_profit_loss', {
      p_from: dateFrom ?? null,
      p_to:   dateTo   ?? null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as ProfitLossRow[];
  },

  async balanceSheet(asOf?: string): Promise<BalanceSheetRow[]> {
    const { data, error } = await supabase.rpc('fn_balance_sheet', {
      p_as_of: asOf ?? null,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as BalanceSheetRow[];
  },
};
