-- Migration: extend clients table with full onboarding fields

alter table clients
  -- Personal details
  add column dob                  date,
  add column ni_number            text,
  add column home_address         text,
  add column email                text,
  add column mobile               text,
  add column government_gateway_id text,

  -- SA registration
  add column sa_registration_date date,
  add column first_year_filer     boolean not null default false,

  -- Agent authorisation
  add column agent_authorised     boolean not null default false,
  add column agent_authorised_at  timestamptz,

  -- AML
  add column aml_checked          boolean not null default false,
  add column aml_method           text,
  add column loe_signed_date      date,

  -- Business profile
  add column nature_of_work       text,
  add column cash_fares           boolean not null default false,
  add column vat_registered       boolean not null default false,
  add column licence_type         text,

  -- Update business_type constraint to include taxi (already added in migration 009,
  -- but included here for completeness in case of fresh installs)
  -- constraint is already updated; no action needed

  -- Flags
  add column hmrc_correspondence  boolean not null default false;

-- Unique index on NI number (one client per NI)
create unique index clients_ni_number_idx on clients (ni_number) where ni_number is not null;
