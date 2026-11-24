-- One shared color per Natural Earth administrative region. No device/user-owned copies.
create table public.blackdoor_travel_regions (
  region_id text primary key check (region_id ~ '^[A-Z0-9+?-]{3,24}$'),
  color text check (color is null or color ~ '^#[0-9a-f]{6}$'),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);
alter table public.blackdoor_travel_regions enable row level security;
revoke all on public.blackdoor_travel_regions from anon, authenticated;
grant select, insert, update on public.blackdoor_travel_regions to service_role;
