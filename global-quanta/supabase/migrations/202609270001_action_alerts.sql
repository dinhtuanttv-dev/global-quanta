create table if not exists public.action_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null check (ticker ~ '^[A-Z0-9.-]{1,10}$'),
  condition text not null check (condition in ('price_above', 'price_below', 'change_pct_above', 'convergence_at_least')),
  threshold numeric not null,
  state text not null default 'pending' check (state in ('pending', 'active', 'triggered', 'paused')),
  created_at timestamptz not null default now()
);

create index if not exists action_alerts_user_created_idx
  on public.action_alerts (user_id, created_at desc);

alter table public.action_alerts enable row level security;

create policy "Users can read their own action alerts"
  on public.action_alerts for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own action alerts"
  on public.action_alerts for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own action alerts"
  on public.action_alerts for delete to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on public.action_alerts to authenticated;
