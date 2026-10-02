-- Chuỗi giá ĐÃ ĐIỀU CHỈNH dài hạn từ SSI (ClosePriceAdjusted), 1 dòng / mã, cho Timing Engine cổ tức (Project A).
-- bars = [[date, close, adjClose, volume], ...] — toàn chuỗi cùng một gốc điều chỉnh; khi SSI đổi hệ số
-- (mã vừa GDKHQ / chia tách) Gateway phát hiện qua phần trùng và tải lại toàn bộ chuỗi.
-- Chỉ backend (service_role) đọc/ghi.

create table if not exists public.market_adjusted_series (
  symbol     text        primary key,
  from_date  date        not null,
  to_date    date        not null,
  source     text,
  bars       jsonb       not null default '[]'::jsonb,
  checked_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.market_adjusted_series enable row level security;
grant select, insert, update, delete on public.market_adjusted_series to service_role;
revoke all on public.market_adjusted_series from anon, authenticated;
