-- Hình vẽ tay trên biểu đồ TA VN-Index theo TÀI KHOẢN + MÃ (đồng bộ mọi máy đã đăng nhập).
-- Trình duyệt gửi qua Gateway; Gateway xác thực phiên Supabase và ghi bằng service_role. Trình duyệt KHÔNG đọc/ghi trực tiếp.

create table if not exists public.market_user_chart_state (
  user_id    uuid        not null,
  symbol     text        not null,
  primitives jsonb       not null default '[]'::jsonb, -- [{id, toolType, p1/p2 | points | anchor, levels?, createdAt}] ≤ 100, ≤ 64KB
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.market_user_chart_state enable row level security;

grant select, insert, update, delete on public.market_user_chart_state to service_role;
revoke all on public.market_user_chart_state from anon, authenticated;
