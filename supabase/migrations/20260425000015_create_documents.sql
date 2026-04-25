-- Migration: document storage table

create table documents (
  id                   uuid    primary key default gen_random_uuid(),
  client_id            uuid    not null references clients (id) on delete cascade,
  tax_year             text    not null,
  -- mirrors transaction categories + special types
  category             text    not null check (category in (
                                  'fuel', 'materials', 'tools', 'insurance',
                                  'software', 'subcontractor', 'income', 'other',
                                  'sa302', 'vehicle_purchase', 'bank_statement',
                                  'platform_statement', 'aml', 'loe',
                                  'hmrc_correspondence', 'mileage_log'
                                )),
  file_url             text    not null,
  file_name            text    not null,
  -- 'pdf' | 'jpg' | 'png' | 'csv'
  file_type            text    not null,
  -- optional link to a specific transaction
  transaction_id       uuid    references transactions (id) on delete set null,
  -- declared expense amount this document covers (for >£200 flag check)
  expense_amount       numeric(12,2),
  -- flagged when expense_amount > 200 and accountant has not yet reviewed
  needs_review         boolean not null default false,
  accountant_reviewed  boolean not null default false,
  -- 'client' | 'accountant'
  uploaded_by          text    not null check (uploaded_by in ('client', 'accountant')),
  upload_date          timestamptz not null default now()
);

create index documents_client_id_idx  on documents (client_id, tax_year);
create index documents_category_idx   on documents (client_id, tax_year, category);
create index documents_needs_review_idx on documents (client_id, needs_review) where needs_review = true;

alter table documents enable row level security;
