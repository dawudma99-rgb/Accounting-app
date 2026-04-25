-- Migration: fix three gaps identified against P-01 to P-33 spec

-- P-04: AML check date (had boolean but not the date)
alter table clients
  add column aml_checked_at timestamptz;

-- MTD sign-up is a one-time client event, not per tax year
alter table clients
  add column mtd_signup_date date;

alter table tax_years
  drop column if exists mtd_signup_date;

-- P-33: Export log — audit trail of every file exported from the system
create table export_logs (
  id          uuid        primary key default gen_random_uuid(),
  client_id   uuid        not null references clients (id) on delete cascade,
  tax_year    text,
  -- 'zip' | 'csv' | 'pdf'
  file_type   text        not null,
  -- e.g. 'hmrc_enquiry', 'client_copy', 'accountant_copy'
  export_type text        not null,
  exported_by uuid        not null,
  exported_at timestamptz not null default now()
);

create index export_logs_client_id_idx on export_logs (client_id);

alter table export_logs enable row level security;
