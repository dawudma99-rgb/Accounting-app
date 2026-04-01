-- Migration: add detail columns to transactions table
-- Stores the full categorisation result so historical runs can be reviewed.

alter table transactions
  add column if not exists reasoning       text,
  add column if not exists source          text
    check (source in ('ai', 'rules', 'hardcoded', 'memory')),
  add column if not exists match_source    text
    check (match_source in ('receipt', 'receipt-uncertain', 'platform', 'unmatched')),
  add column if not exists matched_pattern text,
  add column if not exists review_reason   text;
