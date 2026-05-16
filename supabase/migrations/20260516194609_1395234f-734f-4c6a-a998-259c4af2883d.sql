
-- 1. prf_submissions: sales_stage tracking + lead linkage
alter table public.prf_submissions
  add column if not exists sales_stage text default 'Lead In',
  add column if not exists sales_stage_updated_at timestamptz default now(),
  add column if not exists quote_approved_at timestamptz,
  add column if not exists lead_id uuid;

-- Backfill lead_id from sales_leads.email match
update public.prf_submissions p
set lead_id = sl.id
from public.sales_leads sl
where p.lead_id is null
  and p.email is not null
  and lower(p.email) = lower(sl.email);

-- 2. profiles: shipping address block
alter table public.profiles
  add column if not exists shipping_address_line1 text,
  add column if not exists shipping_address_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_country text;

-- 3. Adventure Bakery warehouses
create table if not exists public.ab_warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.ab_warehouses enable row level security;

drop policy if exists "Staff/admin all ab_warehouses" on public.ab_warehouses;
create policy "Staff/admin all ab_warehouses" on public.ab_warehouses
  for all to authenticated
  using (is_staff_or_admin(auth.uid()))
  with check (is_staff_or_admin(auth.uid()));

drop policy if exists "Authenticated read ab_warehouses" on public.ab_warehouses;
create policy "Authenticated read ab_warehouses" on public.ab_warehouses
  for select to authenticated using (true);

-- Seed default AB warehouse
insert into public.ab_warehouses (name, address)
select 'Adventure Bakery HQ Warehouse', 'Adventure Bakery, Main Warehouse'
where not exists (select 1 from public.ab_warehouses);

-- 4. production_orders: client linkage + multi-item + QB gate + ship-to + waste
alter table public.production_orders
  add column if not exists client_id uuid,
  add column if not exists items jsonb default '[]'::jsonb,
  add column if not exists ship_to_kind text default 'client',
  add column if not exists ship_to_warehouse_id uuid,
  add column if not exists notes text,
  add column if not exists qb_estimate_sent_at timestamptz,
  add column if not exists qb_estimate_accepted_at timestamptz,
  add column if not exists waste_pct numeric;

-- Make legacy columns nullable so new orders can use items[] instead
alter table public.production_orders alter column case_count drop not null;

-- Loosen RLS: staff/admin (was admin-only)
drop policy if exists "Admin full access" on public.production_orders;
drop policy if exists "Staff/admin all production_orders" on public.production_orders;
create policy "Staff/admin all production_orders" on public.production_orders
  for all to authenticated
  using (is_staff_or_admin(auth.uid()))
  with check (is_staff_or_admin(auth.uid()));
