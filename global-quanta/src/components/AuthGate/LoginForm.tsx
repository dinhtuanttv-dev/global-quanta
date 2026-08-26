import { useState } from 'react';

interface Props {
  onSubmit: (username: string, password: string) => Promise<boolean>;
}

export default function LoginForm({ onSubmit }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onSubmit(username.trim(), password);
    if (!ok) {
      setError(true);
      setPassword('');
      setShake(false);
      requestAnimationFrame(() => setShake(true));
    }
  };

  return (
    <div className={`login-card ${shake ? 'shake' : ''}`} onAnimationEnd={() => setShake(false)}>
      <div className="login-logo"><div className="mark">GQ</div><span className="name">GLOBAL QUANTA</span></div>
      <div className="login-sub">Đăng nhập để truy cập Macro &amp; Market Scanner</div>

      {error && <div className="login-error show">⚠ Sai tên đăng nhập hoặc mật khẩu. Vui lòng thử lại.</div>}

      <form onSubmit={handleSubmit}>
        <div className="login-field">
          <label>TÊN ĐĂNG NHẬP</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Nhập tên đăng nhập" autoComplete="username" />
        </div>
        <div className="login-field">
          <label>MẬT KHẨU</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Nhập mật khẩu" autoComplete="current-password" />
        </div>
        <div className="login-row">
          <label className="login-remember"><input type="checkbox" defaultChecked /> Ghi nhớ đăng nhập</label>
          <span className="login-forgot">Quên mật khẩu?</span>
        </div>
        <button type="submit" className="login-btn">ĐĂNG NHẬP</button>
      </form>

      <div className="login-hint">Demo — dùng tài khoản: <b>demo</b> / mật khẩu: <b>demo123</b></div>
      <div className="login-disclaimer">
        Đây là màn hình đăng nhập minh hoạ (client-side demo). Hệ thống thật cần xác thực phía server để đảm bảo an toàn — xem Mục 5.1 trong Dev Handoff Spec.
      </div>
    </div>
  );
}
