-- Project bật chế độ KHÔNG tự cấp quyền cho bảng mới qua Data API, nên phải cấp tường minh.
-- Chỉ cấp cho service_role (khoá bí mật của backend Gateway). KHÔNG cấp cho anon/authenticated:
-- trình duyệt không đọc/ghi được các bảng thị trường (đã kiểm tra bằng khoá publishable).

grant usage on schema public to service_role;

grant select, insert, update, delete on
  public.market_securities,
  public.market_index_components,
  public.market_price_limits,
  public.market_ohlcv_daily,
  public.market_source_events,
  public.market_daily,
  public.market_fundamentals,
  public.market_kv,
  public.market_tick_flow
to service_role;

grant select on
  public.market_daily_dates,
  public.market_ohlcv_coverage,
  public.market_tick_flow_sessions
to service_role;

grant usage, select on sequence public.market_source_events_id_seq to service_role;
grant execute on function public.market_apply_adjustment(text, date, numeric) to service_role;

-- Bảo đảm anon/authenticated không có quyền (kể cả khi trước đó được cấp mặc định).
revoke all on
  public.market_securities, public.market_index_components, public.market_price_limits,
  public.market_ohlcv_daily, public.market_source_events, public.market_daily,
  public.market_fundamentals, public.market_kv, public.market_tick_flow,
  public.market_daily_dates, public.market_ohlcv_coverage, public.market_tick_flow_sessions
from anon, authenticated;
revoke execute on function public.market_apply_adjustment(text, date, numeric) from anon, authenticated, public;
