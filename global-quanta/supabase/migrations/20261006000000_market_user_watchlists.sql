-- ★ Danh mục tự chọn theo TÀI KHOẢN (đồng bộ mọi máy đã đăng nhập): mỗi người dùng một dòng = toàn bộ trạng thái danh mục.
-- Trình duyệt gửi qua Gateway; Gateway xác thực phiên Supabase và ghi bằng service_role. Trình duyệt KHÔNG đọc/ghi trực tiếp.

create table if not exists public.market_user_watchlists (
  user_id    uuid        primary key,
  state      jsonb       not null, -- {lists:[{id,name,tickers,notes?,pinned?}], activeId, radarId?}
  updated_at timestamptz not null default now()
);

alter table public.market_user_watchlists enable row level security;

grant select, insert, update, delete on public.market_user_watchlists to service_role;
revoke all on public.market_user_watchlists from anon, authenticated;
