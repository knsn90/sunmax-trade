import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Lock, KeyRound, CheckCircle, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { APPROVE_PASSWORD_KEY, DEFAULT_APPROVE_PASSWORD } from '@/components/ui/ApproveWithPasswordDialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg mt-2 ${
      type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      {type === 'success'
        ? <CheckCircle className="h-3.5 w-3.5 flex-shrink-0" />
        : <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />}
      {msg}
    </div>
  );
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden h-full">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
        <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
          {icon}
        </div>
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export function ProfilePage() {
  const { t } = useTranslation('profile');
  const { t: tc } = useTranslation('common');
  const { profile, user, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const [avatarUrl, setAvatarUrl]         = useState<string | null>(profile?.avatar_url ?? null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarMsg, setAvatarMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMsg({ type: 'error', msg: t('photo.hint') });
      return;
    }
    setAvatarLoading(true);
    setAvatarMsg(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ avatar_url: base64 })
          .eq('id', profile.id);
        if (error) throw error;
        setAvatarUrl(base64);
        await refreshProfile();
        setAvatarMsg({ type: 'success', msg: t('success.photoUpdated') });
      } catch (err: unknown) {
        setAvatarMsg({ type: 'error', msg: err instanceof Error ? err.message : tc('btn.saving') });
      } finally {
        setAvatarLoading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  // ── Personal info ──────────────────────────────────────────────────────────
  const [fullName, setFullName]       = useState(profile?.full_name ?? '');
  const [infoMsg, setInfoMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  async function saveProfile() {
    if (!profile) return;
    setInfoLoading(true);
    setInfoMsg(null);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() })
        .eq('id', profile.id);
      if (error) throw error;
      await refreshProfile();
      setInfoMsg({ type: 'success', msg: t('success.nameUpdated') });
    } catch (err: unknown) {
      setInfoMsg({ type: 'error', msg: err instanceof Error ? err.message : tc('btn.saving') });
    } finally {
      setInfoLoading(false);
    }
  }

  // ── Change password ────────────────────────────────────────────────────────
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass]         = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  async function changePassword() {
    if (!currentPass) { setPassMsg({ type: 'error', msg: t('errors.currentPasswordRequired') }); return; }
    if (newPass.length < 6) { setPassMsg({ type: 'error', msg: t('errors.passwordLength') }); return; }
    if (newPass !== confirmPass) { setPassMsg({ type: 'error', msg: t('errors.passwordMismatch') }); return; }
    setPassLoading(true);
    setPassMsg(null);
    try {
      const { error: reAuthErr } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: currentPass,
      });
      if (reAuthErr) throw new Error(t('errors.incorrectPassword'));
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      setPassMsg({ type: 'success', msg: t('success.passwordChanged') });
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: unknown) {
      setPassMsg({ type: 'error', msg: err instanceof Error ? err.message : tc('btn.saving') });
    } finally {
      setPassLoading(false);
    }
  }

  // ── Approve password ───────────────────────────────────────────────────────
  const currentApprove = localStorage.getItem(APPROVE_PASSWORD_KEY) ?? DEFAULT_APPROVE_PASSWORD;
  const [oldApprove, setOldApprove]         = useState('');
  const [newApprove, setNewApprove]         = useState('');
  const [confirmApprove, setConfirmApprove] = useState('');
  const [approveMsg, setApproveMsg]         = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function changeApprovePassword() {
    setApproveMsg(null);
    if (oldApprove !== currentApprove) { setApproveMsg({ type: 'error', msg: t('errors.approvalPasswordIncorrect') }); return; }
    if (newApprove.length < 4)         { setApproveMsg({ type: 'error', msg: t('errors.approvalPasswordLength') }); return; }
    if (newApprove !== confirmApprove) { setApproveMsg({ type: 'error', msg: t('errors.approvalPasswordMismatch') }); return; }
    localStorage.setItem(APPROVE_PASSWORD_KEY, newApprove);
    setApproveMsg({ type: 'success', msg: t('success.approvalPasswordChanged') });
    setOldApprove(''); setNewApprove(''); setConfirmApprove('');
  }

  const initials = (profile?.full_name ?? user?.email ?? '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="py-6 px-4 md:px-6 max-w-5xl mx-auto space-y-4">

      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">

        {/* ── LEFT: Personal info + Avatar ── */}
        <div className="space-y-4">

          {/* Avatar */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col items-center gap-4">
              {/* Avatar circle */}
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-md">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-white text-2xl font-bold">{initials}</span>
                  )}
                </div>
                {/* Hover overlay */}
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarLoading}
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                >
                  {avatarLoading
                    ? <Loader2 className="h-6 w-6 text-white animate-spin" />
                    : <Camera className="h-6 w-6 text-white" />}
                </button>
              </div>

              <div className="text-center">
                <div className="font-semibold text-gray-800">{profile?.full_name || '—'}</div>
                <div className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">{profile?.role}</div>
              </div>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={avatarLoading}
                className="text-xs"
              >
                {avatarLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Camera className="h-3.5 w-3.5 mr-1.5" />}
                {t('photo.btnChange')}
              </Button>
              <p className="text-[10px] text-gray-400">{t('photo.hint')}</p>
              {avatarMsg && <Alert {...avatarMsg} />}
            </div>
          </div>

          {/* Personal info */}
          <Card icon={<User className="h-3.5 w-3.5" />} title={t('sections.personalInfo')}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.fullName')}</label>
                <Input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder={t('form.fullName')}
                  onKeyDown={e => e.key === 'Enter' && saveProfile()}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{tc('form.email')}</label>
                <Input value={user?.email ?? ''} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed text-xs" />
                <p className="text-[10px] text-gray-400 mt-1">{t('form.emailReadOnly')}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.role')}</label>
                <Input value={profile?.role ?? ''} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed uppercase text-xs" />
              </div>
              {infoMsg && <Alert {...infoMsg} />}
              <Button onClick={saveProfile} disabled={infoLoading} className="w-full bg-red-600 hover:bg-red-700 text-white">
                {infoLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{tc('btn.saving')}</> : t('buttons.save')}
              </Button>
            </div>
          </Card>
        </div>

        {/* ── RIGHT: Passwords ── */}
        <div className="space-y-4">

          {/* Login password */}
          <Card icon={<Lock className="h-3.5 w-3.5" />} title={t('sections.changePassword')}>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.currentPassword')}</label>
                <Input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder={t('form.currentPasswordPlaceholder')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.newPassword')}</label>
                <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder={t('form.newPasswordPlaceholder')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.confirmPassword')}</label>
                <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder={t('form.confirmPasswordPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && changePassword()} />
              </div>
              {passMsg && <Alert {...passMsg} />}
              <Button onClick={changePassword} disabled={passLoading || !newPass || !currentPass} className="w-full bg-red-600 hover:bg-red-700 text-white">
                {passLoading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />{t('buttons.changing')}</> : t('buttons.changePassword')}
              </Button>
            </div>
          </Card>

          {/* Approve password */}
          <Card icon={<KeyRound className="h-3.5 w-3.5" />} title={t('sections.approvalPassword')}>
            <p className="text-xs text-gray-400 mb-4">{t('approvalDesc')}</p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.currentApprovalPassword')}</label>
                <Input type="password" value={oldApprove} onChange={e => setOldApprove(e.target.value)} placeholder={t('form.currentApprovalPasswordPlaceholder')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.newApprovalPassword')}</label>
                <Input type="password" value={newApprove} onChange={e => setNewApprove(e.target.value)} placeholder={t('form.newApprovalPasswordPlaceholder')} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">{t('form.confirmApprovalPassword')}</label>
                <Input type="password" value={confirmApprove} onChange={e => setConfirmApprove(e.target.value)} placeholder={t('form.confirmApprovalPasswordPlaceholder')}
                  onKeyDown={e => e.key === 'Enter' && changeApprovePassword()} />
              </div>
              {approveMsg && <Alert {...approveMsg} />}
              <Button onClick={changeApprovePassword} disabled={!oldApprove || !newApprove} className="w-full bg-red-600 hover:bg-red-700 text-white">
                {t('buttons.changeApprovalPassword')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
