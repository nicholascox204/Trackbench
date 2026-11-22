-- Trackbench: cloud copy of a person's data. Paste into Supabase > SQL Editor and run once.
--
-- The phone's own database stays the source of truth and logging never waits on this. These tables receive changes in the
-- background and hand back changes made elsewhere (another phone, a web version, a reinstall).
--
-- Rules every table follows:
--   * every row belongs to one user (user_id) and row-level security lets that user reach only their own rows;
--   * ids are made on the phone (text), so a row can be created offline; a row is identified by (user_id, id);
--   * a row is never removed to delete it: deleted_at is set, so the deletion reaches the other devices too;
--   * updated_at is set by the server on every change. A device asks for "everything changed since my last sync", and the
--     later change to a row wins (last write wins; each entry is its own row, so real conflicts are rare).

-- ---------- trackers ----------
-- One row per tracker. The setup (fields, measures, plan, tools, goals, schedule...) is kept whole in config, because it is only
-- ever read and written as one piece; name and position are columns so lists are cheap.
create table if not exists public.trackers (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  name        text        not null,
  sort_order  integer     not null default 0,          -- place in the bottom bar
  config      jsonb       not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

-- ---------- entries ----------
-- One row per logged thing: a tap, a set, a day's reading, a ticked item. Values are kept as the app holds them
-- ({"weight": 60, "reps": 8}) because their shape depends on the tracker.
create table if not exists public.entries (
  user_id     uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id          text        not null,
  tracker_id  text        not null,
  at          timestamptz not null,                    -- when it happened
  data        jsonb       not null default '{}'::jsonb,
  slot_id     text,                                    -- a planned item or exercise
  row_index   integer,                                 -- which set of an exercise
  variant     integer,
  done        boolean     not null default true,
  auto        text[],                                  -- numbers a tick filled in (see the app's Entry type)
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  primary key (user_id, id),
  foreign key (user_id, tracker_id) references public.trackers (user_id, id) on delete cascade
);

-- ---------- settings ----------
-- One row per person: units, week start, appearance, which tracker the app opens on, and so on.
create table if not exists public.settings (
  user_id     uuid        primary key default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ---------- fast lookups ----------
-- A tracker's history in time order (charts, the day view) and "what changed since" for syncing.
create index if not exists entries_tracker_time on public.entries (user_id, tracker_id, at);
create index if not exists entries_changed      on public.entries (user_id, updated_at);
create index if not exists trackers_changed     on public.trackers (user_id, updated_at);

-- ---------- the server sets updated_at ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trackers_touch on public.trackers;
create trigger trackers_touch before insert or update on public.trackers for each row execute function public.touch_updated_at();
drop trigger if exists entries_touch on public.entries;
create trigger entries_touch before insert or update on public.entries for each row execute function public.touch_updated_at();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before insert or update on public.settings for each row execute function public.touch_updated_at();

-- ---------- security: a person reaches only their own rows ----------
alter table public.trackers enable row level security;
alter table public.entries  enable row level security;
alter table public.settings enable row level security;

-- Anonymous sign-ins are signed-in users (the "authenticated" role); a visitor with no sign-in at all gets nothing.
revoke all on public.trackers, public.entries, public.settings from anon;
grant select, insert, update, delete on public.trackers, public.entries, public.settings to authenticated;

drop policy if exists "own trackers" on public.trackers;
create policy "own trackers" on public.trackers for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own entries" on public.entries;
create policy "own entries" on public.entries for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
