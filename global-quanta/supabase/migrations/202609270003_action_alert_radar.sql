create table if not exists public.action_alert_radar_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,10}$'),
  convergence_score smallint not null check (convergence_score between 0 and 6),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

create index if not exists action_alert_radar_snapshots_freshness_idx
  on public.action_alert_radar_snapshots (observed_at desc);

alter table public.action_alert_radar_snapshots enable row level security;

create policy "Users can read their own radar alert snapshots"
  on public.action_alert_radar_snapshots for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can upsert their own radar alert snapshots"
  on public.action_alert_radar_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.action_alert_radar_snapshots to authenticated;
grant select, insert, update, delete on public.action_alert_radar_snapshots to service_role;

alter table public.action_alert_events alter column market_price drop not null;

create or replace function public.trigger_action_alert(
  p_alert_id uuid,
  p_observed_value numeric,
  p_market_price numeric,
  p_provider text,
  p_quote_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.action_alerts%rowtype;
  matched boolean;
  event_row public.action_alert_events%rowtype;
begin
  select * into target from public.action_alerts where id = p_alert_id for update;
  if not found or target.state not in ('pending', 'active') then
    return null;
  end if;

  matched := case target.condition
    when 'price_above' then p_observed_value >= target.threshold
    when 'price_below' then p_observed_value <= target.threshold
    when 'change_pct_above' then p_observed_value >= target.threshold
    when 'convergence_at_least' then p_observed_value >= target.threshold
    else false
  end;

  update public.action_alerts
    set last_checked_at = now(), last_observed_value = p_observed_value,
        state = case when matched then 'triggered' else 'active' end,
        triggered_at = case when matched then now() else triggered_at end
    where id = target.id;

  if not matched then return null; end if;

  insert into public.action_alert_events (
    alert_id, user_id, ticker, condition, threshold,
    observed_value, market_price, provider, quote_at
  ) values (
    target.id, target.user_id, target.ticker, target.condition, target.threshold,
    p_observed_value, p_market_price, p_provider, p_quote_at
  ) returning * into event_row;

  return to_jsonb(event_row);
end;
$$;

revoke all on function public.trigger_action_alert(uuid, numeric, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.trigger_action_alert(uuid, numeric, numeric, text, timestamptz) to service_role;
