import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import * as api from '../../services/api';
import LoginForm from './LoginForm';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { isAuthenticated, login, completeAuthCallback } = useAppStore();
  const callbackRead = useRef(false);
  const [callback, setCallback] = useState<api.AuthCallbackResult | { kind: 'checking' }>({ kind: 'checking' });
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (callbackRead.current) return;
    callbackRead.current = true;
    setCallback(api.consumeAuthCallback());
  }, []);

  const handleSetPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (callback.kind !== 'set-password') return;
    if (password.length < 8) {
      setPasswordError('Mật khẩu cần có ít nhất 8 ký tự.');
      return;
    }
    if (password !== passwordConfirm) {
      setPasswordError('Hai mật khẩu chưa khớp.');
      return;
    }

    setSavingPassword(true);
    setPasswordError('');
    const result = await api.updateSupabasePassword(callback.accessToken, password);
    setSavingPassword(false);
    if (!result.ok) {
      setPasswordError(result.error || 'Không thể cập nhật mật khẩu.');
      return;
    }
    setPassword('');
    setPasswordConfirm('');
    setCallback({ kind: 'none' });
    completeAuthCallback();
  };

  if (callback.kind === 'checking') return null;

  if (callback.kind === 'set-password') {
    return (
      <div id="loginScreen">
        <section className="login-card">
          <div className="login-logo"><div className="mark">GQ</div><span className="name">GLOBAL QUANTA</span></div>
          <div className="login-sub">Tạo mật khẩu để hoàn tất tài khoản</div>
          {passwordError && <div className="login-error show" role="alert">{passwordError}</div>}
          <form onSubmit={handleSetPassword}>
            <div className="login-field">
              <label>MẬT KHẨU MỚI</label>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
            <div className="login-field">
              <label>XÁC NHẬN MẬT KHẨU</label>
              <input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" minLength={8} required />
            </div>
            <button type="submit" className="login-btn" disabled={savingPassword}>
              {savingPassword ? 'ĐANG LƯU…' : 'LƯU MẬT KHẨU'}
            </button>
          </form>
          <div className="login-hint">Dùng mật khẩu riêng, tối thiểu 8 ký tự.</div>
        </section>
      </div>
    );
  }

  if (callback.kind === 'error') {
    return (
      <div id="loginScreen">
        <section className="login-card">
          <div className="login-logo"><div className="mark">GQ</div><span className="name">GLOBAL QUANTA</span></div>
          <div className="login-error show" role="alert">{callback.message}</div>
          <button className="login-btn" type="button" onClick={() => setCallback({ kind: 'none' })}>QUAY LẠI ĐĂNG NHẬP</button>
        </section>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div id="loginScreen">
        <LoginForm onSubmit={login} />
      </div>
    );
  }

  return <>{children}</>;
}
