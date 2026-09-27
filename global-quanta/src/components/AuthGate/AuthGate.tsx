import type { ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore';
import LoginForm from './LoginForm';

interface Props {
  children: ReactNode;
}

export default function AuthGate({ children }: Props) {
  const { isAuthenticated, login } = useAppStore();

  if (!isAuthenticated) {
    return (
      <div id="loginScreen">
        <LoginForm onSubmit={login} />
      </div>
    );
  }

  return <>{children}</>;
}
