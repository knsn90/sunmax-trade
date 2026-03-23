import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/services/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { User, Lock, KeyRound, CheckCircle, AlertCircle } from 'lucide-react';
import { APPROVE_PASSWORD_KEY, DEFAULT_APPROVE_PASSWORD } from '@/components/ui/ApproveWithPasswordDialog';

// ─── Small alert helper ───────────────────────────────────────────────────────
function Alert({ type, msg }: { type: 'success' | 'error'; msg: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mt-2 ${
      type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      {type === 'success' ? <CheckCircle className="h-4 w-4 flex-shrink-0" /> : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
      {msg}
    </div>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-50 bg-gray-50/50">
        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center text-red-600">
          {icon}
        </div>
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

export function ProfilePage() {
  const { profile, user } = useAuth();

  // ── Personal info ──────────────────────────────────────────────────────────
  const [fullName, setFullName]   = useState(profile?.full_name ?? '');
  const [infoMsg, setInfoMsg]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);

  async function saveProfile() {
    if (!profile) return;
    setInfoLoading(true);
    setInfoMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile.id);
    setInfoLoading(false);
    setInfoMsg(error ? { type: 'error', msg: error.message } : { type: 'success', msg: 'Profil güncellendi.' });
  }

  // ── Change password ────────────────────────────────────────────────────────
  const [newPass, setNewPass]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg]       = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [passLoading, setPassLoading] = useState(false);

  async function changePassword() {
    if (newPass.length < 6) { setPassMsg({ type: 'error', msg: 'Şifre en az 6 karakter olmalı.' }); return; }
    if (newPass !== confirmPass) { setPassMsg({ type: 'error', msg: 'Şifreler eşleşmiyor.' }); return; }
    setPassLoading(true);
    setPassMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPass });
    setPassLoading(false);
    if (error) { setPassMsg({ type: 'error', msg: error.message }); return; }
    setPassMsg({ type: 'success', msg: 'Giriş şifresi değiştirildi.' });
    setNewPass('');
    setConfirmPass('');
  }

  // ── Approve password ───────────────────────────────────────────────────────
  const current = localStorage.getItem(APPROVE_PASSWORD_KEY) ?? DEFAULT_APPROVE_PASSWORD;
  const [oldApprove, setOldApprove]     = useState('');
  const [newApprove, setNewApprove]     = useState('');
  const [confirmApprove, setConfirmApprove] = useState('');
  const [approveMsg, setApproveMsg]     = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  function changeApprovePassword() {
    setApproveMsg(null);
    if (oldApprove !== current) { setApproveMsg({ type: 'error', msg: 'Mevcut onay şifresi yanlış.' }); return; }
    if (newApprove.length < 4)  { setApproveMsg({ type: 'error', msg: 'Yeni şifre en az 4 karakter olmalı.' }); return; }
    if (newApprove !== confirmApprove) { setApproveMsg({ type: 'error', msg: 'Şifreler eşleşmiyor.' }); return; }
    localStorage.setItem(APPROVE_PASSWORD_KEY, newApprove);
    setApproveMsg({ type: 'success', msg: 'Onay şifresi değiştirildi.' });
    setOldApprove('');
    setNewApprove('');
    setConfirmApprove('');
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 space-y-5">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900">Profil</h1>
        <p className="text-sm text-gray-500 mt-0.5">{user?.email}</p>
      </div>

      {/* ── Personal info ── */}
      <Card icon={<User className="h-4 w-4" />} title="Kişisel Bilgiler">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Ad Soyad</label>
            <Input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Adınız Soyadınız"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">E-posta</label>
            <Input value={user?.email ?? ''} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed" />
            <p className="text-xs text-gray-400 mt-1">E-posta değiştirilemez.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Rol</label>
            <Input value={profile?.role ?? ''} disabled className="bg-gray-50 text-gray-400 cursor-not-allowed uppercase" />
          </div>
          {infoMsg && <Alert {...infoMsg} />}
          <Button onClick={saveProfile} disabled={infoLoading} className="w-full bg-red-600 hover:bg-red-700 text-white">
            {infoLoading ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </div>
      </Card>

      {/* ── Change login password ── */}
      <Card icon={<Lock className="h-4 w-4" />} title="Giriş Şifresi Değiştir">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Yeni Şifre</label>
            <Input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="En az 6 karakter" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Yeni Şifre (Tekrar)</label>
            <Input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Şifreyi tekrar girin" />
          </div>
          {passMsg && <Alert {...passMsg} />}
          <Button onClick={changePassword} disabled={passLoading || !newPass} className="w-full bg-red-600 hover:bg-red-700 text-white">
            {passLoading ? 'Değiştiriliyor…' : 'Şifreyi Değiştir'}
          </Button>
        </div>
      </Card>

      {/* ── Approve password ── */}
      <Card icon={<KeyRound className="h-4 w-4" />} title="Belge Onay Şifresi">
        <p className="text-xs text-gray-500 mb-4">
          Belgeleri onaylarken (Approve) istenen şifreyi buradan değiştirebilirsiniz.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Mevcut Onay Şifresi</label>
            <Input type="password" value={oldApprove} onChange={e => setOldApprove(e.target.value)} placeholder="Mevcut şifre" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Yeni Onay Şifresi</label>
            <Input type="password" value={newApprove} onChange={e => setNewApprove(e.target.value)} placeholder="Yeni şifre" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">Yeni Onay Şifresi (Tekrar)</label>
            <Input type="password" value={confirmApprove} onChange={e => setConfirmApprove(e.target.value)} placeholder="Şifreyi tekrar girin"
              onKeyDown={e => e.key === 'Enter' && changeApprovePassword()} />
          </div>
          {approveMsg && <Alert {...approveMsg} />}
          <Button onClick={changeApprovePassword} disabled={!oldApprove || !newApprove} className="w-full bg-red-600 hover:bg-red-700 text-white">
            Onay Şifresini Değiştir
          </Button>
        </div>
      </Card>
    </div>
  );
}
