import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const APPROVE_PASSWORD_KEY = 'sunmax_approve_password';
export const DEFAULT_APPROVE_PASSWORD = '#EsenS2024#';
function getApprovePassword() {
  return localStorage.getItem(APPROVE_PASSWORD_KEY) ?? DEFAULT_APPROVE_PASSWORD;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isPending?: boolean;
  title?: string;
  subtitle?: string;
  buttonLabel?: string;
  headerClass?: string;
}

export function ApproveWithPasswordDialog({
  open, onClose, onConfirm, isPending,
  title = 'Onay Şifresi',
  subtitle = 'İşlemi gerçekleştirmek için şifrenizi girin',
  buttonLabel = '✅ Onayla',
  headerClass = 'bg-gradient-to-r from-green-600 to-emerald-500',
}: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  function handleConfirm() {
    if (password === getApprovePassword()) {
      setPassword('');
      setError('');
      onConfirm();
    } else {
      setError('Yanlış şifre. Lütfen tekrar deneyin.');
    }
  }

  function handleClose() {
    setPassword('');
    setError('');
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Dialog */}
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-[340px] mx-4 overflow-hidden">
        {/* Header */}
        <div className={`${headerClass} px-5 py-4 flex items-center gap-3`}>
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <Lock className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm">{title}</div>
            <div className="text-white/75 text-xs">{subtitle}</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div className="mb-1 text-xs font-medium text-gray-600">Şifre</div>
          <Input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); if (e.key === 'Escape') handleClose(); }}
            placeholder="Şifrenizi girin..."
            autoFocus
            className="mb-2"
          />
          {error && (
            <div className="text-xs text-red-500 font-medium mb-2">{error}</div>
          )}

          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isPending}
            >
              İptal
            </Button>
            <Button
              className="flex-1 text-white"
              style={{ background: headerClass.includes('red') ? '#dc2626' : headerClass.includes('amber') ? '#d97706' : '#16a34a' }}
              onClick={handleConfirm}
              disabled={isPending || !password}
            >
              {isPending ? 'İşleniyor…' : buttonLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
