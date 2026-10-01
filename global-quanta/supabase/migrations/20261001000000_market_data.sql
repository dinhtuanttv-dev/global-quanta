-- Kho dữ liệu thị trường dùng chung (SSI là nguồn chính, nguồn cũ là dự phòng).
-- Chỉ backend (SUPABASE_SECRET_KEY) đọc/ghi; RLS bật và không có policy nào
-- cho anon/authenticated nên trình duyệt không truy cập trực tiếp được.

create table if not exists public.market_securities (
  symbol        text primary key,
  exchange      text,
  name          text,
  name_en       text,
  sector        text,
  listed_shares numeric,
  source        text not null,
  updated_at    timestamptz not null default now()
);

create table if not exists public.market_index_components (
  index_code text not null,
  symbol     text not null,
  source     text not null,
  updated_at timestamptz not null default now(),
  primary key (index_code, symbol)
);

create table if not exists public.market_price_limits (
  symbol       text not null,
  trading_date date not null,
  ref_price    numeric,
  ceiling      numeric,
  floor        numeric,
  source       text not null,
  primary key (symbol, trading_date)
);

-- Giá gốc (chưa điều chỉnh). Giá điều chỉnh được tính khi đọc từ SSI
-- DailyStockPrice.ClosePriceAdjusted để luôn phản ánh sự kiện quyền mới nhất.
create table if not exists public.market_ohlcv_daily (
  symbol       text not null,
  trading_date date not null,
  open         numeric not null,
  high         numeric not null,
  low          numeric not null,
  close        numeric not null,
  volume       numeric not null default 0,
  value        numeric,
  source       text not null,           -- SSI_V3 | SSI_FC_V2 | LEGACY
  ingested_at  timestamptz not null default now(),
  primary key (symbol, trading_date)
);
create index if not exists market_ohlcv_daily_source_date_idx
  on public.market_ohlcv_daily (source, trading_date);

-- Tự lành: bản ghi SSI không bao giờ bị bản ghi nguồn dự phòng ghi đè.
create or replace function public.market_keep_ssi_rows()
returns trigger language plpgsql as $$
begin
  if old.source like 'SSI%' and new.source not like 'SSI%' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists market_ohlcv_daily_keep_ssi on public.market_ohlcv_daily;
create trigger market_ohlcv_daily_keep_ssi
  before update on public.market_ohlcv_daily
  for each row execute function public.market_keep_ssi_rows();

-- security_invoker: view tuân theo RLS của bảng gốc, không lộ dữ liệu cho anon.
create or replace view public.market_ohlcv_coverage with (security_invoker = true) as
  select symbol, min(trading_date) as first_date, max(trading_date) as last_date, count(*) as bar_count
  from public.market_ohlcv_daily
  group by symbol;

create table if not exists public.market_source_events (
  id         bigserial primary key,
  provider   text,
  dataset    text,
  from_state text,
  to_state   text,
  reason     text,
  detail     text,
  created_at timestamptz not null default now()
);

alter table public.market_securities       enable row level security;
alter table public.market_index_components enable row level security;
alter table public.market_price_limits     enable row level security;
alter table public.market_ohlcv_daily      enable row level security;
alter table public.market_source_events    enable row level security;
