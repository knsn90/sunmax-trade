import { supabase } from './supabase';
import type { CompanySettings, BankAccount } from '@/types/database';
import type { CompanySettingsFormData, BankAccountFormData } from '@/types/forms';

export const settingsService = {
  async getSettings(): Promise<CompanySettings> {
    const { data, error } = await supabase
      .from('company_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) throw new Error(error.message);
    return data as CompanySettings;
  },

  async updateSettings(input: CompanySettingsFormData): Promise<CompanySettings> {
    // Get existing settings ID
    const existing = await this.getSettings();

    const { data, error } = await supabase
      .from('company_settings')
      .update(input)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as CompanySettings;
  },

  async uploadLogo(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        try {
          const existing = await this.getSettings();
          await supabase
            .from('company_settings')
            .update({ logo_url: base64 })
            .eq('id', existing.id);
          resolve(base64);
        } catch (err) {
          reject(new Error(String(err)));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  },

  async removeLogo(): Promise<void> {
    const existing = await this.getSettings();
    await supabase
      .from('company_settings')
      .update({ logo_url: '' })
      .eq('id', existing.id);
  },

  // ── Bank Accounts ───────────────────────────────────────────────────

  async getBankAccounts(): Promise<BankAccount[]> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('is_default', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []) as BankAccount[];
  },

  async getDefaultBankAccount(): Promise<BankAccount | null> {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data as BankAccount | null;
  },

  async upsertBankAccount(
    id: string | null,
    input: BankAccountFormData,
  ): Promise<BankAccount> {
    if (id) {
      const { data, error } = await supabase
        .from('bank_accounts')
        .update(input)
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return data as BankAccount;
    }

    const { data, error } = await supabase
      .from('bank_accounts')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data as BankAccount;
  },
};
