import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { consumeLegacySession, currentUser, signOut } from '../../services/api';
import LoginForm from './LoginForm';
import ChangePasswordForm from './ChangePasswordForm';

interface Props {
  children: ReactNode;
}

/** Sau mức này màn kiểm tra phiên hiện "máy chủ phản hồi chậm" + nút; quá hạn cứng thì dừng chờ (không bao giờ đứng màn hình đen). */
export const SLOW_MS = 4_000;
export const HARD_CAP_MS = 12_000;

export default function AuthGate({ children }: Props) {
  const { isAuthenticated, login, restoreAuthSession } = useAppStore();
  const [checkingSession, setCheckingSession] = useState(true);
  // Phiên Supabase cũ (trước 23/10/2026) không còn dùng được: xoá và báo người dùng đăng nhập lại.
  const [notice] = useState(() => (consumeLegacySession() ? 'Hệ thống đăng nhập đã chuyển sang máy chủ mới — vui lòng đăng nhập lại.' : null));
  const [pwChanged, setPwChanged] = useState(false);
  const [slow, setSlow] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setCheckingSession(true); setSlow(false);
    const slowTimer = window.setTimeout(() => { if (active) setSlow(true); }, SLOW_MS);
    // Hạn cứng: Gateway treo thì vẫn rời màn kiểm tra (còn phiên -> vào ứng dụng, lần gọi API sau tự đổi token; không -> form đăng nhập).
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, HARD_CAP_MS));
    void Promise.race([restoreAuthSession().then(() => undefined), cap]).finally(() => {
      if (!active) return;
      if (!useAppStore.getState().isAuthenticated && currentUser()) useAppStore.setState({ isAuthenticated: true });
      setCheckingSession(false);
    });
    return () => { active = false; window.clearTimeout(slowTimer); };
  }, [restoreAuthSession, attempt]);

  const relogin = useCallback(() => { void signOut(); useAppStore.setState({ isAuthenticated: false }); setCheckingSession(false); }, []);

  if (checkingSession) {
    // Màn chờ CÓ NỘI DUNG (trước đây là khung trống nền tối -> người dùng thấy "web sập").
    return (
      <div id="loginScreen" aria-label="Đang kiểm tra phiên đăng nhập" aria-busy="true" data-testid="auth-checking">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-logo"><div className="mark">ĐT</div><span className="name">ĐINH TUẤN</span></div>
          <p role="status" style={{ color: '#94a3b8', fontSize: 13, margin: '12px 0 4px' }}>Đang kiểm tra phiên đăng nhập…</p>
          {slow && (
            <div data-testid="auth-slow">
              <p style={{ color: '#fbbf24', fontSize: 12, margin: '6px 0 10px' }}>Máy chủ đang phản hồi chậm — sẽ tự vào trong vài giây, hoặc chọn bên dưới.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="login-btn" style={{ width: 'auto', padding: '6px 14px' }} onClick={() => setAttempt((n) => n + 1)}>Thử lại</button>
                <button type="button" className="login-btn" style={{ width: 'auto', padding: '6px 14px', background: 'transparent', border: '1px solid #334155' }} onClick={relogin}>Đăng nhập lại</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div id="loginScreen">
        <LoginForm onSubmit={login} notice={notice} />
      </div>
    );
  }

  if (currentUser()?.mustChangePassword && !pwChanged) {
    return (
      <div id="loginScreen">
        <div className="login-card">
          <div className="login-logo"><div className="mark">ĐT</div><span className="name">ĐINH TUẤN</span></div>
          <ChangePasswordForm required onDone={() => setPwChanged(true)} />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
