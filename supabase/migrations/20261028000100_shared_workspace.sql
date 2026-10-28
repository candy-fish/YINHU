-- Schema only. No browser records, files, counters or local database exports.
create table public.blackdoor_records (
  id uuid primary key default gen_random_uuid(),
  resource text not null check (resource in ('day-notes', 'anniversaries', 'journals', 'thoughts', 'windows', 'media')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index blackdoor_resource_created on public.blackdoor_records(resource, created_at);
create unique index blackdoor_day_unique on public.blackdoor_records ((data->>'note_date')) where resource = 'day-notes';
create unique index blackdoor_journal_unique on public.blackdoor_records ((data->>'period_key')) where resource = 'journals';
alter table public.blackdoor_records enable row level security;
revoke all on public.blackdoor_records from anon, authenticated;
grant all on public.blackdoor_records to service_role;

create table public.blackdoor_counter (
  singleton boolean primary key default true check (singleton),
  value bigint not null default 0 check (value >= 0)
);
create table public.blackdoor_increments (
  id uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.blackdoor_counter enable row level security;
alter table public.blackdoor_increments enable row level security;
revoke all on public.blackdoor_counter, public.blackdoor_increments from anon, authenticated;
grant all on public.blackdoor_counter, public.blackdoor_increments to service_role;

-- An insert and increment share one transaction. Retrying the same UUID is safe.
create function public.blackdoor_increment(operation_id uuid default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare inserted_count integer; current_value bigint;
begin
  insert into public.blackdoor_counter(singleton, value) values (true, 0) on conflict do nothing;
  if operation_id is not null then
    insert into public.blackdoor_increments(id) values (operation_id) on conflict do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then
      update public.blackdoor_counter set value = value + 1 where singleton = true;
    end if;
  end if;
  select value into current_value from public.blackdoor_counter where singleton = true;
  return jsonb_build_object('value', current_value::text, 'id', operation_id);
end;
$$;
revoke all on function public.blackdoor_increment(uuid) from public, anon, authenticated;
grant execute on function public.blackdoor_increment(uuid) to service_role;

insert into storage.buckets(id, name, public, file_size_limit)
values ('blackdoor-media', 'blackdoor-media', false, 52428800)
on conflict (id) do nothing;

