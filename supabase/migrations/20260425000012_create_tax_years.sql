-- Migration: create tax_years table
-- One row per client per tax year. Stores all calculated figures and submission state.

create table tax_years (
  id                       uuid          primary key default gen_random_uuid(),
  client_id                uuid          not null references clients (id) on delete cascade,
  -- e.g. '2025-26'
  tax_year                 text          not null,

  -- Income & expenses (GBP)
  gross_income             numeric(12,2),
  total_expenses           numeric(12,2),
  net_profit               numeric(12,2),

  -- Tax liability breakdown
  income_tax               numeric(12,2),
  class2_nic               numeric(12,2),
  class4_nic               numeric(12,2),
  student_loan_repayment   numeric(12,2),
  total_liability          numeric(12,2),

  -- Payments on account
  poa1_amount              numeric(12,2),
  poa1_date                date,
  poa1_paid                boolean not null default false,
  poa2_amount              numeric(12,2),
  poa2_date                date,
  poa2_paid                boolean not null default false,
  balancing_payment        numeric(12,2),
  balancing_date           date,

  -- SA303 election (POA reduction)
  sa303_elected            boolean not null default false,
  sa303_reduced_amount     numeric(12,2),

  -- Carry-forward / relief
  losses_brought_forward   numeric(12,2) not null default 0,
  losses_carried_forward   numeric(12,2) not null default 0,
  overlap_relief_claimed   numeric(12,2) not null default 0,

  -- Prior year SA302
  sa302_url                text,
  sa302_unavailable        boolean not null default false,

  -- HMRC submission
  hmrc_submission_ref      text,
  submitted_at             timestamptz,
  accountant_approved_at   timestamptz,
  accountant_approved_by   uuid,

  -- MTD
  mtd_flag                 boolean not null default false,
  mtd_signup_date          date,
  mtd_penalty_points       integer not null default 0,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  unique (client_id, tax_year)
);

create index tax_years_client_id_idx on tax_years (client_id);
create index tax_years_tax_year_idx  on tax_years (client_id, tax_year desc);

alter table tax_years enable row level security;
