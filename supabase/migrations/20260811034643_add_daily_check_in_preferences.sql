create table if not exists public.daily_check_in_preferences (
  id text primary key default 'default' check (id = 'default'),
  enabled boolean not null default true,
  times jsonb not null default '[{"hour":20,"minute":0}]'::jsonb check (
    jsonb_typeof(times) = 'array'
    and jsonb_array_length(times) <= 5
  ),
  updated_at timestamptz,
  inserted_at timestamptz not null default now()
);

drop trigger if exists set_daily_check_in_preferences_updated_at
on public.daily_check_in_preferences;
create trigger set_daily_check_in_preferences_updated_at
before update on public.daily_check_in_preferences
for each row execute function public.set_updated_at();

alter table public.daily_check_in_preferences enable row level security;
revoke all on table public.daily_check_in_preferences from anon, authenticated;
grant select, insert, update, delete on table public.daily_check_in_preferences to service_role;

insert into public.daily_check_in_preferences (id, enabled, times, updated_at)
values ('default', true, '[{"hour":20,"minute":0}]'::jsonb, null)
on conflict (id) do nothing;
