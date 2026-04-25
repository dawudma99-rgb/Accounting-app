-- Migration: student loans, platforms, flags, mileage logs

-- ─── Student loan plans ───────────────────────────────────────────────────────

create table student_loans (
  id           uuid    primary key default gen_random_uuid(),
  client_id    uuid    not null references clients (id) on delete cascade,
  plan_type    text    not null check (plan_type in ('plan1', 'plan2', 'plan4', 'pgl')),
  active       boolean not null default true,
  start_date   date,
  repaid_date  date,
  created_at   timestamptz not null default now(),

  unique (client_id, plan_type)
);

alter table student_loans enable row level security;

-- ─── Platforms ────────────────────────────────────────────────────────────────

create table client_platforms (
  id         uuid    primary key default gen_random_uuid(),
  client_id  uuid    not null references clients (id) on delete cascade,
  platform   text    not null check (platform in ('uber', 'bolt', 'freenow', 'ola')),
  active     boolean not null default true,
  created_at timestamptz not null default now(),

  unique (client_id, platform)
);

alter table client_platforms enable row level security;

-- ─── Accountant flags ─────────────────────────────────────────────────────────

create table flags (
  id              uuid  primary key default gen_random_uuid(),
  client_id       uuid  not null references clients (id) on delete cascade,
  tax_year        text,
  -- e.g. 'bank_variance', 'hmrc_correspondence', 'missing_mileage_log',
  --      'business_use_over_90', 'other_income', 'overlap_relief', etc.
  flag_type       text  not null,
  description     text  not null,
  -- 'open' | 'resolved' | 'overridden' | 'held'
  status          text  not null default 'open'
                        check (status in ('open', 'resolved', 'overridden', 'held')),
  raised_at       timestamptz not null default now(),
  resolved_at     timestamptz,
  resolved_by     uuid,
  override_reason text
);

create index flags_client_id_idx on flags (client_id, status);

alter table flags enable row level security;

-- ─── Mileage logs ─────────────────────────────────────────────────────────────

create table mileage_logs (
  id             uuid    primary key default gen_random_uuid(),
  client_id      uuid    not null references clients (id) on delete cascade,
  vehicle_id     uuid    references vehicles (id) on delete set null,
  tax_year       text    not null,
  -- 'manual' = entered row by row; 'csv' = uploaded file
  source         text    not null default 'manual' check (source in ('manual', 'csv')),
  -- For manual entries
  trip_date      date,
  start_location text,
  end_location   text,
  miles          numeric(8,2),
  is_business    boolean,
  -- For CSV uploads — stores file reference
  csv_url        text,
  created_at     timestamptz not null default now()
);

create index mileage_logs_client_id_idx on mileage_logs (client_id, tax_year);

alter table mileage_logs enable row level security;
