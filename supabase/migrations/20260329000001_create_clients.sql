-- Migration: create clients table
-- Stores sole trader profiles for the accounting tool.

create table clients (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  -- UK Unique Taxpayer Reference (10 digits, issued by HMRC)
  utr           text        unique,
  -- 'mechanic' | 'plumber'
  business_type text        not null check (business_type in ('mechanic', 'plumber')),
  -- Estimated annual gross income in GBP (used for tax band calculations)
  gross_income  numeric(12, 2),
  -- 'self_assessment' | 'mtd' (Making Tax Digital)
  tax_regime    text        not null default 'self_assessment'
                            check (tax_regime in ('self_assessment', 'mtd')),
  -- HMRC Self Assessment form variant: 'SA103S' (short) | 'SA103F' (full)
  form_version  text        check (form_version in ('SA103S', 'SA103F')),
  bank_connected boolean    not null default false,
  created_at    timestamptz not null default now()
);

-- Index for lookups by business type (e.g. filtering dashboards)
create index clients_business_type_idx on clients (business_type);

-- Enable Row Level Security (add policies per your auth strategy)
alter table clients enable row level security;
