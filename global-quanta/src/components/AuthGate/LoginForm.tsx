import { useState } from 'react';
import { isAuthConfigured } from '../../services/api';

interface Props {
  /** true nếu thành công, ngược lại thông báo lỗi. */
  onSubmit: (email: string, password: string) => Promise<true | string | boolean>;
  /** Thông báo hiện sẵn (VD phiên Supabase cũ đã hết dùng được sau khi chuyển hệ thống đăng nhập). */
  notice?: string | null;
}

export default function LoginForm({ onSubmit, notice = null }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const configured = isAuthConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await onSubmit(email.trim(), password);
      if (r === true) return;
      setError(typeof r === 'string' ? r : 'Không đăng nhập được. Hãy kiểm tra email và mật khẩu rồi thử lại.');
      setPassword('');
      setShake(false);
      requestAnimationFrame(() => setShake(true));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={`login-card ${shake ? 'shake' : ''}`} onAnimationEnd={() => setShake(false)}>
      <div className="login-logo"><div className="mark">ĐT</div><span className="name">ĐINH TUẤN</span></div>
      <div className="login-sub">Đăng nhập để truy cập Macro &amp; Market Scanner</div>

      {!configured && <div className="login-error show" role="alert">Máy chủ đăng nhập (Market Gateway) đang tắt cho website này.</div>}
      {notice && !error && <div className="login-error show" role="status" style={{ borderColor: 'rgba(251,191,36,0.4)', color: '#fcd34d' }}>{notice}</div>}
      {error && <div className="login-error show" role="alert">{error}</div>}

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

      <div className="login-hint">Đăng nhập do máy chủ ĐINH TUẤN xác thực (mật khẩu băm scrypt, phiên ký Ed25519).</div>
    </div>
  );
}
