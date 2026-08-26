export function SearchBar() {
  return (
    <div className="search-box">
      Tìm mã, lệnh AI...
      <kbd>/</kbd>
    </div>
  );
}

export function NotificationBell({ hasUnread = true }: { hasUnread?: boolean }) {
  return (
    <div className="icon-btn">
      🔔
      {hasUnread && <span className="badge-dot" />}
    </div>
  );
}

export function UserAvatar({ initials = 'NA' }: { initials?: string }) {
  return <div className="avatar">{initials}</div>;
}
