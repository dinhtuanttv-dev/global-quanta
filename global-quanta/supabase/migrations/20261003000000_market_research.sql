-- Tầng dữ liệu nghiên cứu dài hạn (IFE / Volume Profile) + vòng phản hồi tín hiệu + trọng số học được.
--
-- Nguyên tắc dung lượng: dữ liệu chi tiết nhất (tick theo phút) chỉ giữ N ngày; mọi thứ cần cho
-- backtest được cô đặc thành 1 dòng/mã/phiên và giữ vĩnh viễn:
--   market_tick_flow (phút, giữ N ngày)  ->  market_tick_flow_daily (phiên, vĩnh viễn)
--   nến phút SSI (≈12 tháng phía SSI)     ->  market_flow_daily + market_volume_profile_daily (vĩnh viễn)
-- Chỉ backend (service_role) đọc/ghi; anon/authenticated bị thu hồi quyền (RLS bật, không policy).

-- ---------- 1. Dòng tiền theo phiên (IFE lớp 1–4, cô đặc) ----------
create table if not exists public.market_flow_daily (
  symbol            text    not null,
  trading_date      date    not null,
  method            text    not null check (method in ('BVC', 'LEE_READY')),
  close             numeric,
  ref_price         numeric,
  volume            numeric,          -- tổng KL phiên (kể cả ATO/ATC)
  continuous_volume numeric,          -- KL khớp liên tục (cơ sở của delta)
  delta             numeric,          -- mua chủ động − bán chủ động
  large_delta       numeric,          -- delta của các phút KL ≥ ngưỡng "tay to"
  small_delta       numeric,
  ret               numeric,          -- lợi suất phiên so với tham chiếu
  minute_p95        numeric,          -- p95 KL phút liên tục trong phiên (để dựng ngưỡng tay to trượt)
  features          jsonb,            -- đặc trưng đã chuẩn hoá tại cuối phiên (không nhìn tương lai)
  updated_at        timestamptz not null default now(),
  primary key (symbol, trading_date)
);
create index if not exists market_flow_daily_date_brin on public.market_flow_daily using brin (trading_date);

-- ---------- 2. Volume Profile theo phiên ----------
create table if not exists public.market_volume_profile_daily (
  symbol       text    not null,
  trading_date date    not null,
  poc          numeric,
  va_low       numeric,
  va_high      numeric,
  vwap         numeric,
  bins         jsonb   not null default '[]'::jsonb, -- [{priceLow, priceHigh, volume}] 24 bin
  source       text    not null default 'MINUTE_BARS',
  updated_at   timestamptz not null default now(),
  primary key (symbol, trading_date)
);
create index if not exists market_volume_profile_daily_date_brin on public.market_volume_profile_daily using brin (trading_date);

-- ---------- 3. Trạng thái thị trường theo ngày (nhãn Uptrend / Downtrend / Sideway) ----------
create table if not exists public.market_regime_daily (
  trading_date  date primary key,
  index_code    text    not null default 'VNINDEX',
  close         numeric not null,
  ma20          numeric,
  ma50          numeric,
  ma200         numeric,
  breadth_pct   numeric,             -- % mã trong universe đóng cửa trên MA20
  impulse_score numeric,             -- Market Impulse Gauge (cùng công thức Siêu Quét)
  regime        text    not null check (regime in ('UPTREND', 'DOWNTREND', 'SIDEWAY')),
  updated_at    timestamptz not null default now()
);

-- ---------- 4. Sổ cái tín hiệu + kết quả T+3/T+5/T+10 (vòng phản hồi) ----------
create table if not exists public.market_signal_ledger (
  symbol        text     not null,          -- 'VNINDEX' cho tín hiệu cấp thị trường
  signal_date   date     not null,
  signal        text     not null,          -- STEALTH_5 | STEALTH_20 | IFE_INTENT | IMPULSE | ADAPTIVE_T3/T5/T10
  direction     smallint not null check (direction in (-1, 0, 1)),
  score         numeric,                    -- giá trị gốc của tín hiệu (z, xác suất, điểm 0–100)
  regime        text,
  model_version text,
  features      jsonb,
  created_at    timestamptz not null default now(),
  primary key (symbol, signal_date, signal)
);
create index if not exists market_signal_ledger_date_idx on public.market_signal_ledger (signal_date);
create index if not exists market_signal_ledger_signal_idx on public.market_signal_ledger (signal, signal_date);

create table if not exists public.market_signal_outcomes (
  symbol       text     not null,
  signal_date  date     not null,
  signal       text     not null,
  horizon      smallint not null check (horizon in (3, 5, 10)),
  ret          numeric  not null,           -- lợi suất mã (giá điều chỉnh) sau h phiên
  bench_ret    numeric,                     -- VN-Index cùng kỳ
  excess_ret   numeric,                     -- ret − bench_ret (với IMPULSE: = ret)
  barrier      smallint,                    -- ba rào chắn ±1,5 ATR: 1 trên, −1 dưới, 0 không chạm
  mfe          numeric,                     -- biên lợi lớn nhất theo chiều tín hiệu
  mae          numeric,                     -- biên lỗ lớn nhất theo chiều tín hiệu
  hit          boolean,                     -- direction × excess_ret > 0 (null khi direction = 0)
  evaluated_at timestamptz not null default now(),
  primary key (symbol, signal_date, signal, horizon),
  foreign key (symbol, signal_date, signal) references public.market_signal_ledger (symbol, signal_date, signal) on delete cascade
);
create index if not exists market_signal_outcomes_signal_idx on public.market_signal_outcomes (signal, horizon);

-- ---------- 5. Trọng số học được (champion / challenger, lưu mọi phiên bản để kiểm toán) ----------
create table if not exists public.market_model_weights (
  model      text not null,                 -- ADAPTIVE_T3 | ADAPTIVE_T5 | ADAPTIVE_T10
  version    text not null,
  status     text not null check (status in ('active', 'candidate', 'rejected', 'retired')),
  trained_at timestamptz not null default now(),
  train_from date,
  train_to   date,
  weights    jsonb not null,                -- { global: {...}, regimes: {UPTREND: {...}, ...}, scaler: {...} }
  metrics    jsonb not null,                -- chỉ số ngoài mẫu (walk-forward có purge/embargo)
  primary key (model, version)
);
create unique index if not exists market_model_weights_one_active on public.market_model_weights (model) where status = 'active';

-- ---------- 6. Tick theo phiên (cô đặc từ market_tick_flow, giữ vĩnh viễn) ----------
create table if not exists public.market_tick_flow_daily (
  symbol       text    not null,
  trading_date date    not null,
  minutes      integer not null,
  buy          numeric not null,
  sell         numeric not null,
  unknown      numeric not null,
  prints       integer not null,
  updated_at   timestamptz not null default now(),
  primary key (symbol, trading_date)
);

create or replace function public.market_rollup_tick_flow(p_since date)
returns integer language sql security definer set search_path = public as $$
  with up as (
    insert into public.market_tick_flow_daily (symbol, trading_date, minutes, buy, sell, unknown, prints, updated_at)
    select symbol, trading_date, count(*), sum(buy), sum(sell), sum(unknown), sum(prints), now()
    from public.market_tick_flow where trading_date >= p_since
    group by symbol, trading_date
    on conflict (symbol, trading_date) do update set
      minutes = excluded.minutes, buy = excluded.buy, sell = excluded.sell,
      unknown = excluded.unknown, prints = excluded.prints, updated_at = now()
    returning 1
  ) select count(*)::int from up;
$$;

-- Xoá tick theo phút cũ hơn p_keep_days, CHỈ những phiên đã được cô đặc.
create or replace function public.market_prune_tick_flow(p_keep_days integer)
returns integer language sql security definer set search_path = public as $$
  with del as (
    delete from public.market_tick_flow t
    where t.trading_date < current_date - greatest(p_keep_days, 7)
      and exists (select 1 from public.market_tick_flow_daily d where d.symbol = t.symbol and d.trading_date = t.trading_date)
    returning 1
  ) select count(*)::int from del;
$$;

-- ---------- 7. Tầng dataset chuẩn cho backtest (materialized view) ----------
-- 1 dòng / mã / phiên: giá & thanh khoản, dòng tiền IFE, Volume Profile, trạng thái thị trường,
-- và lợi suất TƯƠNG LAI T+3/5/10 (mã và VN-Index) — chỉ dùng làm nhãn, không làm đặc trưng.
drop materialized view if exists public.market_research_dataset_mv;
create materialized view public.market_research_dataset_mv as
with px as (
  select d.symbol, d.trading_date, d.close, d.close_adj, d.volume, d.value,
         lead(d.close_adj, 3)  over w / nullif(d.close_adj, 0) - 1 as fwd_ret_3,
         lead(d.close_adj, 5)  over w / nullif(d.close_adj, 0) - 1 as fwd_ret_5,
         lead(d.close_adj, 10) over w / nullif(d.close_adj, 0) - 1 as fwd_ret_10
  from public.market_daily d
  where d.symbol in (select symbol from public.market_flow_daily group by symbol)
  window w as (partition by d.symbol order by d.trading_date)
), bench as (
  select trading_date, regime, impulse_score, breadth_pct,
         lead(close, 3)  over w / nullif(close, 0) - 1 as bench_ret_3,
         lead(close, 5)  over w / nullif(close, 0) - 1 as bench_ret_5,
         lead(close, 10) over w / nullif(close, 0) - 1 as bench_ret_10
  from public.market_regime_daily
  window w as (order by trading_date)
)
select px.symbol, px.trading_date, px.close, px.close_adj, px.volume, px.value,
       f.method, f.delta, f.large_delta, f.small_delta, f.continuous_volume, f.features,
       vp.poc, vp.va_low, vp.va_high, vp.vwap,
       b.regime, b.impulse_score, b.breadth_pct,
       px.fwd_ret_3, px.fwd_ret_5, px.fwd_ret_10,
       b.bench_ret_3, b.bench_ret_5, b.bench_ret_10,
       px.fwd_ret_3 - b.bench_ret_3 as excess_ret_3,
       px.fwd_ret_5 - b.bench_ret_5 as excess_ret_5,
       px.fwd_ret_10 - b.bench_ret_10 as excess_ret_10
from px
join public.market_flow_daily f on f.symbol = px.symbol and f.trading_date = px.trading_date
left join public.market_volume_profile_daily vp on vp.symbol = px.symbol and vp.trading_date = px.trading_date
left join bench b on b.trading_date = px.trading_date
with data;
create unique index market_research_dataset_mv_pk on public.market_research_dataset_mv (symbol, trading_date);
create index market_research_dataset_mv_date on public.market_research_dataset_mv (trading_date);
create index market_research_dataset_mv_regime on public.market_research_dataset_mv (regime, trading_date);

-- Hiệu suất tín hiệu theo trạng thái thị trường × kỳ hạn (cho SQL / backtest; UI đọc bản JS tương đương).
drop materialized view if exists public.market_signal_performance_mv;
create materialized view public.market_signal_performance_mv as
select l.signal,
       case when grouping(l.regime) = 1 then 'ALL' else coalesce(l.regime, 'UNKNOWN') end as regime,
       o.horizon, l.direction,
       count(*)                                         as n,
       avg(case when o.hit then 1.0 else 0.0 end)       as hit_rate,
       avg(o.ret)                                       as avg_ret,
       avg(o.excess_ret * l.direction)                  as avg_signed_excess,
       stddev_samp(o.excess_ret * l.direction)          as sd_signed_excess,
       avg(o.excess_ret * l.direction) / nullif(stddev_samp(o.excess_ret * l.direction) / sqrt(count(*)), 0) as t_stat,
       min(l.signal_date) as first_date, max(l.signal_date) as last_date
from public.market_signal_ledger l
join public.market_signal_outcomes o using (symbol, signal_date, signal)
where l.direction <> 0
group by grouping sets ((l.signal, l.regime, o.horizon, l.direction), (l.signal, o.horizon, l.direction))
with data;
create unique index market_signal_performance_mv_pk on public.market_signal_performance_mv (signal, regime, horizon, direction);

create or replace function public.market_refresh_research()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently public.market_research_dataset_mv;
  refresh materialized view concurrently public.market_signal_performance_mv;
end;
$$;

-- ---------- 8. Bảo mật ----------
alter table public.market_flow_daily enable row level security;
alter table public.market_volume_profile_daily enable row level security;
alter table public.market_regime_daily enable row level security;
alter table public.market_signal_ledger enable row level security;
alter table public.market_signal_outcomes enable row level security;
alter table public.market_model_weights enable row level security;
alter table public.market_tick_flow_daily enable row level security;

grant select, insert, update, delete on
  public.market_flow_daily, public.market_volume_profile_daily, public.market_regime_daily,
  public.market_signal_ledger, public.market_signal_outcomes, public.market_model_weights,
  public.market_tick_flow_daily
to service_role;
grant select on public.market_research_dataset_mv, public.market_signal_performance_mv to service_role;
grant execute on function public.market_rollup_tick_flow(date), public.market_prune_tick_flow(integer), public.market_refresh_research() to service_role;

revoke all on
  public.market_flow_daily, public.market_volume_profile_daily, public.market_regime_daily,
  public.market_signal_ledger, public.market_signal_outcomes, public.market_model_weights,
  public.market_tick_flow_daily, public.market_research_dataset_mv, public.market_signal_performance_mv
from anon, authenticated;
revoke execute on function public.market_rollup_tick_flow(date), public.market_prune_tick_flow(integer), public.market_refresh_research() from anon, authenticated, public;
