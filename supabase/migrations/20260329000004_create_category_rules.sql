-- Migration: create category_rules table
-- Merchant-to-category lookup cache populated by the categorisation engine.
-- The engine checks this table before calling Claude, and writes back after an AI call.
-- Merchant names are stored lowercase for case-insensitive matching.

create table category_rules (
  id            uuid        primary key default gen_random_uuid(),
  -- Stored lowercase; matched with ilike in the categorisation engine
  merchant      text        not null,
  category      text        not null check (category in (
                              'fuel', 'materials', 'tools', 'insurance',
                              'software', 'subcontractor', 'income', 'other'
                            )),
  business_type text        not null check (business_type in ('mechanic', 'plumber')),
  -- 0–100 score; rules with confidence >= 80 are served from cache without an AI call
  confidence    integer     not null check (confidence between 0 and 100),
  -- Incremented each time this rule is used; useful for pruning low-value rules
  usage_count   integer     not null default 1,
  created_at    timestamptz not null default now(),

  -- The engine upserts on this pair, so it must be unique
  unique (merchant, business_type)
);

create index category_rules_merchant_idx      on category_rules (merchant);
create index category_rules_business_type_idx on category_rules (business_type);

-- No RLS — this is a shared lookup table, not user-scoped data
