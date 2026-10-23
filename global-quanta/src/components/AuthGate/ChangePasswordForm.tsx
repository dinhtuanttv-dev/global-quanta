// Đổi mật khẩu (menu tài khoản; bắt buộc ở lần đăng nhập đầu nếu admin đặt "phải đổi"). Tối thiểu 12 ký tự; các phiên ở máy khác bị thu hồi.
import { useState } from 'react';
import { changePassword } from '../../services/api';

export default function ChangePasswordForm({ onDone, required = false }: { onDone?: () => void; required?: boolean }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (next.length < 12) { setError('Mật khẩu mới tối thiểu 12 ký tự.'); return; }
    if (next !== confirm) { setError('Hai lần nhập mật khẩu mới không khớp.'); return; }
    setBusy(true);
    const err = await changePassword(current, next);
    setBusy(false);
    if (err) { setError(err); return; }
    setOk(true); setCurrent(''); setNext(''); setConfirm('');
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="tb-pw-form" data-testid="change-password">
      {required && <p className="tb-warn">Tài khoản cần đổi mật khẩu trước khi sử dụng.</p>}
      <label htmlFor="pw-current">Mật khẩu hiện tại</label>
      <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      <label htmlFor="pw-new">Mật khẩu mới (≥ 12 ký tự)</label>
      <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={12} />
      <label htmlFor="pw-confirm">Nhập lại mật khẩu mới</label>
      <input id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={12} />
      {error && <p className="tb-pw-error" role="alert">{error}</p>}
      {ok && <p className="tb-pw-ok" role="status">Đã đổi mật khẩu. Các phiên ở máy khác đã bị đăng xuất.</p>}
      <button type="submit" className="tb-menu-item" disabled={busy}>{busy ? 'Đang lưu…' : 'Đổi mật khẩu'}</button>
    </form>
  );
}
