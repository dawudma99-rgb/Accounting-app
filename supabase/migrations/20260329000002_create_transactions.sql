-- Migration: create transactions table
-- Stores bank transactions fetched via TrueLayer, enriched with AI categorisation.

create table transactions (
  id               uuid          primary key default gen_random_uuid(),
  client_id        uuid          not null references clients (id) on delete cascade,
  date             date          not null,
  -- Positive = income, negative = expense (GBP)
  amount           numeric(12, 2) not null,
  merchant         text,
  description      text,
  -- One of the 8 HMRC categories used by the categorisation engine
  category         text          check (category in (
                                   'fuel', 'materials', 'tools', 'insurance',
                                   'software', 'subcontractor', 'income', 'other'
                                 )),
  -- 0–100 confidence score from the categorisation engine
  confidence_score integer       check (confidence_score between 0 and 100),
  -- pending        → newly imported, not yet reviewed
  -- auto_approved  → high-confidence AI result accepted automatically
  -- flagged        → low confidence or unusual amount, needs review
  -- reviewed       → manually confirmed or corrected by the client
  status           text          not null default 'pending'
                                 check (status in ('pending', 'auto_approved', 'flagged', 'reviewed')),
  -- Raw JSON payload from TrueLayer (preserved for debugging / re-processing)
  raw_bank_data    jsonb,
  created_at       timestamptz   not null default now()
);

create index transactions_client_id_idx  on transactions (client_id);
create index transactions_date_idx       on transactions (client_id, date desc);
create index transactions_status_idx     on transactions (client_id, status);
create index transactions_category_idx   on transactions (client_id, category);

alter table transactions enable row level security;
