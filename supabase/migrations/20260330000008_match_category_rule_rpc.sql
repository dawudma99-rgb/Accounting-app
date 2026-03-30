-- Migration: add match_category_rule RPC + allow 'taxi' business type
--
-- Problem being solved:
--   The categorisation engine previously fetched ALL rules for a business type
--   on every transaction, then filtered them in JavaScript. For a large rulebook
--   this is slow and wastes bandwidth.
--
-- Solution:
--   A PostgreSQL function that does the regex match and amount range check inside
--   the database using the ~* operator (case-insensitive regex), returning only
--   the single best-matching rule. The engine calls this via supabase.rpc().
--
-- Also adds 'taxi' to the business_type check constraint.

-- ─── 1. Allow 'taxi' as a business type ──────────────────────────────────────

alter table category_rules
  drop constraint category_rules_business_type_check;

alter table category_rules
  add constraint category_rules_business_type_check
  check (business_type in ('mechanic', 'plumber', 'taxi'));

-- ─── 2. Create the match function ────────────────────────────────────────────
--
-- Parameters:
--   p_description   Full bank statement description text (e.g. "SHELL 8327 ROMFORD DIESEL")
--   p_business_type Trade type to scope the lookup (e.g. "taxi")
--   p_amount        Absolute transaction amount in GBP (always positive)
--
-- Returns the highest-confidence rule whose pattern matches the description and
-- whose amount range (if set) contains p_amount. Returns no rows if no match.
--
-- The ~* operator is PostgreSQL's case-insensitive regex match:
--   'SHELL.*DIESEL' ~* 'shell 8327 romford diesel' → true
--
-- STABLE: tells Postgres this function does not modify data and returns the same
-- result for the same inputs within a single transaction — allows query optimisation.

create or replace function match_category_rule(
  p_description   text,
  p_business_type text,
  p_amount        numeric
)
returns table (
  id            uuid,
  pattern       text,
  category      text,
  confidence    integer,
  amount_min    numeric,
  amount_max    numeric,
  business_type text,
  created_at    timestamptz
)
language sql
stable
as $$
  select
    id,
    pattern,
    category,
    confidence,
    amount_min,
    amount_max,
    business_type,
    created_at
  from category_rules
  where
    business_type = p_business_type
    and p_description ~* pattern
    and (amount_min is null or p_amount >= amount_min)
    and (amount_max is null or p_amount <= amount_max)
  order by confidence desc
  limit 1;
$$;

-- Grant execute to the authenticated and service roles used by Supabase clients
grant execute on function match_category_rule(text, text, numeric)
  to authenticated, service_role;
