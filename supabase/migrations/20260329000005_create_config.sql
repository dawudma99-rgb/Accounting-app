-- Migration: create config table
-- Key-value store for app-wide configuration (e.g. feature flags, thresholds, tax rates).
-- Values are stored as JSONB to support strings, numbers, booleans, and objects.

create table config (
  key        text        primary key,
  value      jsonb       not null,
  updated_at timestamptz not null default now()
);

-- Seed with initial defaults
insert into config (key, value) values
  -- Confidence threshold below which a transaction is flagged for manual review
  ('categorisation_auto_approve_threshold', '80'),
  -- Confidence threshold below which a transaction is flagged (rather than auto-approved)
  ('categorisation_flag_threshold',         '50'),
  -- UK 2025/26 personal allowance in GBP
  ('uk_personal_allowance_gbp',            '12570'),
  -- UK 2025/26 basic rate tax band upper limit in GBP
  ('uk_basic_rate_limit_gbp',              '50270');

-- Function + trigger to auto-update updated_at on every write
create or replace function update_config_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger config_updated_at_trigger
  before update on config
  for each row execute function update_config_updated_at();
