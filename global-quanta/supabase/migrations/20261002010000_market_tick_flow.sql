-- Dòng lệnh có dấu theo Lee–Ready (IFE lớp 1), gom theo phút, ghi từ StreamHub của
-- Gateway. Dùng để IFE đọc lịch sử Lee–Ready thay cho BVC khi đã tích luỹ đủ phiên.
-- Chỉ backend (SUPABASE_SECRET_KEY) đọc/ghi; RLS bật, không có policy cho anon/authenticated.

create table if not exists public.market_tick_flow (
  symbol       text     not null,
  trading_date date     not null,
  minute       smallint not null,           -- phút trong ngày theo giờ VN (VD 600 = 10:00)
  buy          numeric  not null default 0, -- KL mua chủ động
  sell         numeric  not null default 0, -- KL bán chủ động
  unknown      numeric  not null default 0, -- KL không xác định được chiều
  prints       integer  not null default 0, -- số lần khớp ghi nhận
  sizes        jsonb    not null default '{}'::jsonb, -- phân bố kích thước lệnh {size: số lần}
  updated_at   timestamptz not null default now(),
  primary key (symbol, trading_date, minute)
);
create index if not exists market_tick_flow_date_idx on public.market_tick_flow (trading_date);

-- Tổng hợp theo phiên để IFE biết mã/phiên nào đã có đủ tick.
create or replace view public.market_tick_flow_sessions with (security_invoker = true) as
  select symbol, trading_date, count(*) as minutes, sum(buy + sell + unknown) as volume, sum(prints) as prints
  from public.market_tick_flow
  group by symbol, trading_date;

alter table public.market_tick_flow enable row level security;
