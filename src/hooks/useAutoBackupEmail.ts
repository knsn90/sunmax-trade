import { useEffect } from 'react';
import { supabase } from '@/services/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';

const LS_EMAIL    = 'sunmax_backup_email';
const LS_SCHEDULE = 'sunmax_backup_schedule';
const LS_LAST     = 'sunmax_backup_last_sent';

export type BackupSchedule = 'session_end' | 'daily' | 'manual';

export const BACKUP_DEFAULTS = {
  email:    'plkimya@gmail.com',
  schedule: 'session_end' as BackupSchedule,
};

export function getBackupSettings() {
  return {
    email:    localStorage.getItem(LS_EMAIL)    ?? BACKUP_DEFAULTS.email,
    schedule: (localStorage.getItem(LS_SCHEDULE) ?? BACKUP_DEFAULTS.schedule) as BackupSchedule,
    lastSent: localStorage.getItem(LS_LAST) ?? null,
  };
}

export function saveBackupSettings(email: string, schedule: BackupSchedule) {
  localStorage.setItem(LS_EMAIL,    email);
  localStorage.setItem(LS_SCHEDULE, schedule);
}

/** Calls the Supabase Edge Function to send backup email.
 *  Uses supabase.functions.invoke() — handles JWT auth automatically.
 *  Returns { ok: true } on success, or { ok: false, error: string } on failure. */
export async function sendBackupEmail(trigger: 'session_end' | 'manual' | 'daily' = 'manual') {
  const { email } = getBackupSettings();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Oturum bulunamadı' };

  try {
    const { data, error } = await supabase.functions.invoke('send-backup-email', {
      body: { to: email, trigger },
    });

    if (error) {
      // FunctionsHttpError içinde gerçek Resend/function hatası var
      if (error instanceof FunctionsHttpError) {
        const body = await error.context.json().catch(() => ({})) as { error?: string };
        return { ok: false, error: body.error ?? error.message };
      }
      return { ok: false, error: error.message };
    }

    if (data?.ok) {
      localStorage.setItem(LS_LAST, new Date().toISOString());
      return { ok: true as const, rows: data.rows as number };
    }
    return { ok: false, error: (data?.error as string) ?? 'Bilinmeyen hata' };
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Bağlantı hatası' };
  }
}

/** Register a beforeunload handler that fires the backup if schedule = session_end.
 *  Place this hook in App.tsx so it runs regardless of which page is active. */
export function useAutoBackupEmail() {
  useEffect(() => {
    function onBeforeUnload() {
      const { schedule } = getBackupSettings();
      if (schedule !== 'session_end') return;
      // Fire-and-forget with keepalive so the request survives page unload
      sendBackupEmail('session_end').catch(() => {/* ignore */});
    }

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);
}
