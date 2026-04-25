-- Migration: MTD quarterly submission tracking

create table mtd_quarters (
  id                    uuid    primary key default gen_random_uuid(),
  client_id             uuid    not null references clients (id) on delete cascade,
  tax_year              text    not null,
  -- 1 = Apr-Jun (due 5 Aug), 2 = Jul-Sep (due 5 Nov),
  -- 3 = Oct-Dec (due 5 Feb), 4 = Jan-Mar (due 5 May)
  quarter               integer not null check (quarter between 1 and 4),

  -- Client-entered figures
  income                numeric(12,2) not null default 0,
  expenses              numeric(12,2) not null default 0,

  -- Calculated cumulative YTD at point of submission
  cumulative_income     numeric(12,2),
  cumulative_expenses   numeric(12,2),

  -- HMRC indicative estimate returned after submission
  indicative_tax        numeric(12,2),

  -- Submission state
  accountant_approved_at timestamptz,
  submitted_at          timestamptz,
  hmrc_ref              text,
  -- 'pending' | 'approved' | 'submitted' | 'missed'
  status                text not null default 'pending'
                             check (status in ('pending', 'approved', 'submitted', 'missed')),
  deadline              date not null,

  created_at            timestamptz not null default now(),

  unique (client_id, tax_year, quarter)
);

create index mtd_quarters_client_id_idx on mtd_quarters (client_id, tax_year);

alter table mtd_quarters enable row level security;
