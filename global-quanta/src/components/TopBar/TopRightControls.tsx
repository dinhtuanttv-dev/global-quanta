// TOPBAR T3 — menu tài khoản (spec §6.9): bấm avatar MỞ MENU (không đăng xuất ngay); đăng xuất là một mục riêng.
// Chuông thông báo đã gỡ cho tới khi có hệ thống thông báo thật (trước đây luôn hiện chấm "chưa đọc" giả).
import { useAppStore } from '../../store/useAppStore';
import { currentUserEmail } from '../../services/api';
import Popover, { PopTrigger, usePopover } from './Popover';

const initialsOf = (email: string | null) => {
  if (!email) return 'TK';
  const name = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, ' ').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase() || 'TK';
};

export function AccountMenu() {
  const logout = useAppStore((s) => s.logout);
  const pop = usePopover();
  const email = currentUserEmail();
  return (
    <>
      <PopTrigger pop={pop} label="Tài khoản" className="avatar">{initialsOf(email)}</PopTrigger>
      <Popover pop={pop} title="Tài khoản" width={240}>
        <div className="tb-account" data-testid="tb-account">
          <p className="tb-muted">{email ?? 'Đã đăng nhập'}</p>
          <button type="button" className="tb-menu-item tb-danger" onClick={() => { pop.close(false); logout(); }}>Đăng xuất</button>
        </div>
      </Popover>
    </>
  );
}
