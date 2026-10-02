-- Lịch sử ELITE COMMAND RADAR: mỗi người dùng × ★ danh mục × ngày giao dịch một ảnh chụp
-- (trạng thái cuối cùng trong ngày; trình duyệt tính radar rồi gửi qua Gateway, Gateway xác thực
-- phiên đăng nhập Supabase và ghi bằng service_role). Trình duyệt KHÔNG đọc/ghi trực tiếp bảng này.

create table if not exists public.market_radar_snapshots (
  user_id    uuid        not null,
  list_key   text        not null check (char_length(list_key) between 1 and 80),
  snap_date  date        not null,
  items      jsonb       not null default '[]'::jsonb, -- [{t, s, g, sm, st, core, pass, p, c}]
  updated_at timestamptz not null default now(),
  primary key (user_id, list_key, snap_date)
);

alter table public.market_radar_snapshots enable row level security;

grant select, insert, update, delete on public.market_radar_snapshots to service_role;
revoke all on public.market_radar_snapshots from anon, authenticated;
