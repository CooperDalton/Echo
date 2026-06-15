create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_stored_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.stored_at = now();
  return new;
end;
$$;

create table if not exists public.notes (
  id text primary key,
  title text not null,
  body text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  bucket text check (
    bucket is null
    or bucket in ('Business Ideas', 'Reflections', 'Game Dev', 'Family', 'Systems')
  ),
  classification_status text not null default 'pending' check (
    classification_status in ('pending', 'classified', 'failed')
  ),
  classification_method text not null default 'unknown' check (
    classification_method in ('ai', 'keyword', 'unknown')
  ),
  classification_confidence double precision check (
    classification_confidence is null
    or (classification_confidence >= 0 and classification_confidence <= 1)
  ),
  widget_text text,
  echo jsonb not null,
  file_path text,
  inserted_at timestamptz not null default now(),
  stored_at timestamptz not null default now()
);

create index if not exists notes_created_at_idx on public.notes (created_at desc);
create index if not exists notes_updated_at_idx on public.notes (updated_at desc);
create index if not exists notes_bucket_idx on public.notes (bucket);

drop trigger if exists set_notes_stored_at on public.notes;
create trigger set_notes_stored_at
before update on public.notes
for each row execute function public.set_stored_at();

create table if not exists public.check_ins (
  id text primary key,
  created_at timestamptz not null,
  kind text not null check (kind in ('evening', 'random')),
  source text not null default 'mobile' check (source in ('mobile', 'obsidian')),
  energy integer not null check (energy between 1 and 5),
  emotions jsonb not null,
  body text not null default '',
  file_path text,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists check_ins_created_at_idx on public.check_ins (created_at desc);

drop trigger if exists set_check_ins_updated_at on public.check_ins;
create trigger set_check_ins_updated_at
before update on public.check_ins
for each row execute function public.set_updated_at();

create table if not exists public.deleted_notes (
  id text primary key,
  file_path text,
  deleted_at timestamptz not null,
  inserted_at timestamptz not null default now()
);

create index if not exists deleted_notes_deleted_at_idx on public.deleted_notes (deleted_at desc);

create table if not exists public.bucket_preferences (
  id text primary key default 'default' check (id = 'default'),
  builtins jsonb not null default '{}'::jsonb,
  customs jsonb not null default '[]'::jsonb,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_bucket_preferences_updated_at on public.bucket_preferences;
create trigger set_bucket_preferences_updated_at
before update on public.bucket_preferences
for each row execute function public.set_updated_at();

create table if not exists public.standing_messages (
  id text primary key,
  text text not null default '',
  created_at timestamptz not null,
  updated_at timestamptz not null,
  inserted_at timestamptz not null default now(),
  stored_at timestamptz not null default now()
);

create index if not exists standing_messages_created_at_idx on public.standing_messages (created_at asc);

drop trigger if exists set_standing_messages_stored_at on public.standing_messages;
create trigger set_standing_messages_stored_at
before update on public.standing_messages
for each row execute function public.set_stored_at();

create table if not exists public.sync_devices (
  id text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.notes enable row level security;
alter table public.check_ins enable row level security;
alter table public.deleted_notes enable row level security;
alter table public.bucket_preferences enable row level security;
alter table public.standing_messages enable row level security;
alter table public.sync_devices enable row level security;

insert into public.bucket_preferences (id, builtins, customs)
values ('default', '{}'::jsonb, '[]'::jsonb)
on conflict (id) do nothing;
