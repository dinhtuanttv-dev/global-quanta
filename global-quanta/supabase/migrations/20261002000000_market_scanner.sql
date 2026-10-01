-- Siêu Quét AI chạy trên Gateway: dữ liệu ngày toàn thị trường (SSI), BCTC lưu
-- đệm (VCI), kết quả quét/universe (khoá-giá trị). Chỉ backend (SUPABASE_SECRET_KEY)
-- đọc/ghi; RLS bật, không có policy cho anon/authenticated.

create table if not exists public.market_daily (
  symbol          text not null,
  trading_date    date not null,
  exchange        text,
  open            numeric not null,
  high            numeric not null,
  low             numeric not null,
  close           numeric not null,
  close_adj       numeric not null,  -- giá điều chỉnh; được nhân lại khi có sự kiện quyền mới
  ref_price       numeric,
  ceiling         numeric,
  floor           numeric,
  volume          numeric not null default 0,  -- KL khớp lệnh
  value           numeric not null default 0,  -- GT khớp lệnh (VND)
  deal_volume     numeric not null default 0,
  deal_value      numeric not null default 0,
  foreign_buy_vol  numeric not null default 0,
  foreign_sell_vol numeric not null default 0,
  foreign_buy_val  numeric not null default 0,
  foreign_sell_val numeric not null default 0,
  foreign_room    numeric,
  primary key (symbol, trading_date)
);
create index if not exists market_daily_date_idx on public.market_daily (trading_date);

create or replace view public.market_daily_dates with (security_invoker = true) as
  select distinct trading_date from public.market_daily;

-- Sự kiện quyền mới: nhân giá điều chỉnh của toàn bộ lịch sử tới ngày p_upto.
create or replace function public.market_apply_adjustment(p_symbol text, p_upto date, p_factor numeric)
returns integer language plpgsql security invoker as $$
declare n integer;
begin
  update public.market_daily set close_adj = close_adj * p_factor
   where symbol = p_symbol and trading_date <= p_upto;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.market_apply_adjustment(text, date, numeric) from public, anon, authenticated;

create table if not exists public.market_fundamentals (
  ticker     text primary key,
  income     jsonb not null,
  balance    jsonb not null,
  fetched_at timestamptz not null default now()
);

create table if not exists public.market_kv (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.market_daily        enable row level security;
alter table public.market_fundamentals enable row level security;
alter table public.market_kv           enable row level security;
