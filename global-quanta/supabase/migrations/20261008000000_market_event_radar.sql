-- Event Radar: current event projection plus append-only source/content revisions.
-- All access is server-side through the Market Gateway service role.
create table if not exists public.market_event_radar_events (
  event_id text primary key,
  cluster_id text,
  published_at timestamptz,
  first_seen_at timestamptz not null,
  source text not null,
  source_label text not null,
  source_authority text not null,
  verification_status text not null,
  event_type text not null,
  severity text not null,
  tickers text[] not null default '{}',
  content_hash text not null,
  revision integer not null default 1,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists market_event_radar_events_first_seen_idx
  on public.market_event_radar_events (first_seen_at desc);
create index if not exists market_event_radar_events_published_idx
  on public.market_event_radar_events (published_at desc);
create index if not exists market_event_radar_events_type_idx
  on public.market_event_radar_events (event_type, first_seen_at desc);
create index if not exists market_event_radar_events_tickers_idx
  on public.market_event_radar_events using gin (tickers);

create table if not exists public.market_event_radar_revisions (
  revision_id text primary key,
  event_id text not null,
  content_hash text not null,
  observed_at timestamptz not null,
  payload jsonb not null
);
create index if not exists market_event_radar_revisions_event_idx
  on public.market_event_radar_revisions (event_id, observed_at asc);

alter table public.market_event_radar_events enable row level security;
alter table public.market_event_radar_revisions enable row level security;
grant select, insert, update, delete on public.market_event_radar_events, public.market_event_radar_revisions to service_role;
revoke all on public.market_event_radar_events, public.market_event_radar_revisions from anon, authenticated;
