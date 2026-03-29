-- Migration: create receipts table
-- Stores receipt/invoice images uploaded by the client and their OCR-extracted data.

create table receipts (
  id             uuid          primary key default gen_random_uuid(),
  client_id      uuid          not null references clients (id) on delete cascade,
  -- Nullable until the matching service links this receipt to a transaction
  transaction_id uuid          references transactions (id) on delete set null,
  -- Supabase Storage URL or external image URL
  image_url      text          not null,
  -- Raw OCR response from Google Vision (preserved for re-processing)
  ocr_raw        jsonb,
  -- Fields extracted from the OCR output
  merchant       text,
  amount         numeric(12, 2),
  date           date,
  -- True once the matching service has linked this to a transaction
  matched        boolean       not null default false,
  created_at     timestamptz   not null default now()
);

create index receipts_client_id_idx      on receipts (client_id);
create index receipts_transaction_id_idx on receipts (transaction_id);
create index receipts_matched_idx        on receipts (client_id, matched);

alter table receipts enable row level security;
