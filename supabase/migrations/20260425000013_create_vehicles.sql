-- Migration: create vehicles and vehicle_pool_years tables

create table vehicles (
  id                    uuid    primary key default gen_random_uuid(),
  client_id             uuid    not null references clients (id) on delete cascade,

  -- DVLA lookup fields
  registration          text    not null,
  make                  text,
  model                 text,
  fuel_type             text,
  co2_gkm               integer,

  -- Purchase details
  purchase_date         date,
  purchase_price        numeric(12,2),
  is_new                boolean not null default false,

  -- Ownership & method
  ownership_type        text    not null check (ownership_type in ('own', 'rent', 'other')),
  -- locked after year one confirmation
  expense_method        text    check (expense_method in ('mileage', 'actual', 'rental')),
  expense_method_locked boolean not null default false,

  business_use_percent  numeric(5,2) check (business_use_percent between 0 and 100),

  -- Disposal
  disposal_date         date,
  disposal_proceeds     numeric(12,2),

  created_at            timestamptz not null default now(),

  unique (client_id, registration)
);

create index vehicles_client_id_idx on vehicles (client_id);

alter table vehicles enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────

-- One row per vehicle per tax year — tracks the capital allowance pool
create table vehicle_pool_years (
  id                    uuid          primary key default gen_random_uuid(),
  vehicle_id            uuid          not null references vehicles (id) on delete cascade,
  tax_year              text          not null,

  opening_pool          numeric(12,2) not null default 0,
  additions             numeric(12,2) not null default 0,
  -- 0.18 = main rate pool, 0.06 = special rate, 1.00 = electric FYA
  wda_rate              numeric(5,4)  not null,
  wda_gross             numeric(12,2),
  private_use_restriction numeric(12,2),
  allowable_wda         numeric(12,2),
  closing_pool          numeric(12,2),

  -- On disposal
  balancing_allowance   numeric(12,2),
  balancing_charge      numeric(12,2),

  created_at            timestamptz   not null default now(),

  unique (vehicle_id, tax_year)
);

create index vehicle_pool_years_vehicle_id_idx on vehicle_pool_years (vehicle_id);

alter table vehicle_pool_years enable row level security;
