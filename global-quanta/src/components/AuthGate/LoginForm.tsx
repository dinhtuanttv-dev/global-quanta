import { useState } from 'react';
import { isSupabaseAuthConfigured } from '../../services/api';

interface Props {
  onSubmit: (email: string, password: string) => Promise<boolean>;
}

export default function LoginForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const configured = isSupabaseAuthConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured || submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const ok = await onSubmit(email.trim(), password);
      if (ok) return;
      setError(true);
      setPassword('');
      setShake(false);
      requestAnimationFrame(() => setShake(true));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`login-card ${shake ? 'shake' : ''}`} onAnimationEnd={() => setShake(false)}>
      <div className="login-logo"><div className="mark">GQ</div><span className="name">GLOBAL QUANTA</span></div>
      <div className="login-sub">Đăng nhập để truy cập Macro &amp; Market Scanner</div>

      {!configured && <div className="login-error show" role="alert">Supabase Auth chưa được cấu hình cho website này.</div>}
      {error && <div className="login-error show" role="alert">Không đăng nhập được. Hãy kiểm tra email và mật khẩu rồi thử lại.</div>}

      <form onSubmit={handleSubmit}>
        <div className="login-field">
          <label htmlFor="login-email">EMAIL</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" required />
        </div>
        <div className="login-field">
          <label htmlFor="login-password">MẬT KHẨU</label>
          <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" autoComplete="current-password" required />
        </div>
        <button type="submit" className="login-btn" disabled={!configured || submitting}>
          {submitting ? 'ĐANG ĐĂNG NHẬP…' : 'ĐĂNG NHẬP'}
        </button>
      </form>

      <div className="login-hint">Đăng nhập được xác thực bằng Supabase Auth.</div>
    </div>
  );
}
