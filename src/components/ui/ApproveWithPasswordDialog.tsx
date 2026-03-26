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
}

export function ApproveWithPasswordDialog({ open, onClose, onConfirm, isPending }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (!open) return null;

  function handleConfirm() {
    if (password === getApprovePassword()) {
      setPassword('');
      setError('');
      onConfirm();
    } else {
      setError('Wrong password. Please try again.');
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
        <div className="bg-gradient-to-r from-green-600 to-emerald-500 px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <Lock className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-white font-bold text-sm">Approval Password</div>
            <div className="text-white/75 text-xs">Enter password to approve this document</div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <div className="mb-1 text-xs font-medium text-gray-600">Password</div>
          <Input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            placeholder="Enter password..."
            autoFocus
            className="mb-2"
          />
          {error && (
            <div className="text-xs text-red-500 font-medium mb-2">{error}</div>
          )}
          <p className="text-xs text-gray-400 mb-4">
            This document will be signed and approved. Signature and stamp will be added automatically.
          </p>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirm}
              disabled={isPending || !password}
            >
              {isPending ? 'Approving…' : '✅ Approve'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
