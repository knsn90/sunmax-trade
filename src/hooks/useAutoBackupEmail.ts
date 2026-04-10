import { useEffect } from 'react';
import { supabase } from '@/services/supabase';

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
 *  Returns { ok: true } on success, or { ok: false, error: string } on failure. */
export async function sendBackupEmail(trigger: 'session_end' | 'manual' | 'daily' = 'manual') {
  const { email } = getBackupSettings();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: 'Oturum bulunamadı' };

  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  const functionUrl  = `${supabaseUrl}/functions/v1/send-backup-email`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        supabaseKey,
      },
      body: JSON.stringify({ to: email, trigger }),
      keepalive: true,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeout));

    const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; rows?: number };

    if (res.ok && body.ok) {
      localStorage.setItem(LS_LAST, new Date().toISOString());
      return { ok: true, rows: body.rows };
    }
    return { ok: false, error: body.error ?? `HTTP ${res.status}` };
  } catch (err) {
    const msg = (err as Error).message ?? 'Bağlantı hatası';
    return { ok: false, error: msg.includes('abort') ? 'Zaman aşımı (30sn)' : msg };
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
