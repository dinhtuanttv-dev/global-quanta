alter table public.action_alerts
  add column if not exists triggered_at timestamptz,
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_observed_value numeric;

alter table public.action_alerts drop constraint if exists action_alerts_condition_check;
alter table public.action_alerts add constraint action_alerts_condition_check
  check (condition in ('price_above', 'price_below', 'change_pct_above', 'convergence_at_least'));

update public.action_alerts set state = 'paused'
where condition = 'convergence_at_least' and state in ('pending', 'active');

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'action_alert_threshold_valid') then
    alter table public.action_alerts add constraint action_alert_threshold_valid check (
      (condition = 'change_pct_above' and threshold between 0 and 100)
      or (condition in ('price_above', 'price_below') and threshold > 0 and threshold <= 1000000000)
      or (condition = 'convergence_at_least' and threshold between 1 and 6 and threshold = trunc(threshold))
    );
  end if;
end $$;

create table if not exists public.action_alert_events (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null unique references public.action_alerts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  condition text not null,
  threshold numeric not null,
  observed_value numeric not null,
  market_price numeric not null,
  provider text not null,
  quote_at timestamptz not null,
  triggered_at timestamptz not null default now()
);

create index if not exists action_alert_events_user_triggered_idx
  on public.action_alert_events (user_id, triggered_at desc);

alter table public.action_alert_events enable row level security;

create policy "Users can read their own action alert events"
  on public.action_alert_events for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.action_alert_events to authenticated;

create table if not exists public.action_alert_worker_leases (
  name text primary key,
  locked_until timestamptz not null
);

alter table public.action_alert_worker_leases enable row level security;
grant select, insert, update, delete on public.action_alerts, public.action_alert_events, public.action_alert_worker_leases to service_role;

insert into public.action_alert_worker_leases (name, locked_until)
values ('action_alert_evaluator', '1970-01-01T00:00:00Z')
on conflict (name) do nothing;

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
