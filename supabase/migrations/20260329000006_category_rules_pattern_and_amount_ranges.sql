-- Migration: evolve category_rules from merchant-name matching to regex pattern matching
--
-- Changes in this migration:
--   1. Rename `merchant` → `pattern` (the engine now stores regex strings, not plain names)
--   2. Drop the old unique constraint and merchant index, recreate on `pattern`
--   3. Add `amount_min` and `amount_max` columns for per-pattern amount range filtering
--
-- The categorisation engine (src/services/categorisation/engine.ts) tests each stored
-- pattern case-insensitively against the full bank statement description, then checks
-- that the transaction amount falls within [amount_min, amount_max] if set.
--
-- Existing rows: the old `merchant` values (e.g. "shell") become initial patterns.
-- They will still match via case-insensitive regex, but consider replacing them with
-- more precise patterns (e.g. "SHELL.*DIESEL") once the engine has re-processed recent
-- transactions and written back richer patterns.

-- ─── 1. Rename column ─────────────────────────────────────────────────────────

alter table category_rules
  rename column merchant to pattern;

-- ─── 2. Update unique constraint ─────────────────────────────────────────────

alter table category_rules
  drop constraint category_rules_merchant_business_type_key;

alter table category_rules
  add constraint category_rules_pattern_business_type_key
  unique (pattern, business_type);

-- ─── 3. Update index ──────────────────────────────────────────────────────────

drop index category_rules_merchant_idx;

create index category_rules_pattern_idx on category_rules (pattern);

-- ─── 4. Add amount range columns ─────────────────────────────────────────────

alter table category_rules
  add column amount_min numeric
    check (amount_min is null or amount_min >= 0),
  add column amount_max numeric
    check (amount_max is null or amount_max >= 0),
  add constraint category_rules_amount_range_check
    check (
      amount_min is null or
      amount_max is null or
      amount_min <= amount_max
    );

comment on column category_rules.pattern    is 'Case-insensitive regex matched against the full bank statement description. Example: ''SHELL.*DIESEL''';
comment on column category_rules.amount_min is 'Inclusive lower bound on |amount| in GBP. NULL means no lower limit.';
comment on column category_rules.amount_max is 'Inclusive upper bound on |amount| in GBP. NULL means no upper limit.';
