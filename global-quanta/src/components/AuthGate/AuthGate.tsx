import { useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import LoginForm from './LoginForm';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { isAuthenticated, login, restoreAuthSession } = useAppStore();
  const [checkingSession, setCheckingSession] = useState(true);

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
        <LoginForm onSubmit={login} />
      </div>
    );
  }

  return <>{children}</>;
}
