import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { consumeLegacySession, currentUser } from '../../services/api';
import LoginForm from './LoginForm';
import ChangePasswordForm from './ChangePasswordForm';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { isAuthenticated, login, restoreAuthSession } = useAppStore();
  const [checkingSession, setCheckingSession] = useState(true);
  // Phiên Supabase cũ (trước 23/10/2026) không còn dùng được: xoá và báo người dùng đăng nhập lại.
  const [notice] = useState(() => (consumeLegacySession() ? 'Hệ thống đăng nhập đã chuyển sang máy chủ mới — vui lòng đăng nhập lại.' : null));
  const [pwChanged, setPwChanged] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreAuthSession().finally(() => {
      if (active) setCheckingSession(false);
    });
    return () => { active = false; };
  }, [restoreAuthSession]);

  if (checkingSession) {
    return <div id="loginScreen" aria-label="Đang kiểm tra phiên đăng nhập" />;
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
