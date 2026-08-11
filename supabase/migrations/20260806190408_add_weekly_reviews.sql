create table if not exists public.weekly_reviews (
  id text primary key,
  scheduled_for timestamptz not null,
  completed_at timestamptz not null,
  updated_at timestamptz not null,
  reflection text not null check (length(btrim(reflection)) > 0),
  next_week_intent text not null check (length(btrim(next_week_intent)) > 0),
  inserted_at timestamptz not null default now()
);
create index if not exists weekly_reviews_scheduled_for_idx
on public.weekly_reviews (scheduled_for desc);

drop trigger if exists set_weekly_reviews_updated_at on public.weekly_reviews;
create trigger set_weekly_reviews_updated_at
before update on public.weekly_reviews
for each row execute function public.set_updated_at();
create table if not exists public.weekly_review_preferences (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default false,
  weekday smallint not null default 1 check (weekday between 1 and 7),
  hour smallint not null default 18 check (hour between 0 and 23),
  minute smallint not null default 0 check (minute between 0 and 59),
  starts_at timestamptz,
  updated_at timestamptz,
  inserted_at timestamptz not null default now(),
  check (not enabled or starts_at is not null)
);
drop trigger if exists set_weekly_review_preferences_updated_at on public.weekly_review_preferences;
create trigger set_weekly_review_preferences_updated_at
before update on public.weekly_review_preferences
for each row execute function public.set_updated_at();
alter table public.weekly_reviews enable row level security;
alter table public.weekly_review_preferences enable row level security;

revoke all on table public.weekly_reviews from anon, authenticated;
revoke all on table public.weekly_review_preferences from anon, authenticated;
grant select, insert, update, delete on table public.weekly_reviews to service_role;
grant select, insert, update, delete on table public.weekly_review_preferences to service_role;
insert into public.weekly_review_preferences (
  id,
  enabled,
  weekday,
  hour,
  minute,
  starts_at,
  updated_at
)
values ('default', false, 1, 18, 0, null, null)
on conflict (id) do nothing;
