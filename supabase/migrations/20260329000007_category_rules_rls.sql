-- Migration: enable RLS on category_rules
--
-- The categorisation engine accesses this table server-side using the
-- service role key, which bypasses RLS automatically in Supabase — no
-- explicit policy is required for that path.
--
-- Enabling RLS here ensures the anon key (used by browser clients) cannot
-- read or write category rules directly, even if someone obtains the
-- publishable key.
--
-- If you later need authenticated users to read their own rules through the
-- browser, add a SELECT policy scoped to auth.uid() = client_id (once a
-- client_id foreign key exists on this table).

alter table category_rules enable row level security;

-- Deny-by-default: no policies means no access for the anon or authenticated
-- roles. Only the service role (used by the engine) can read and write.
