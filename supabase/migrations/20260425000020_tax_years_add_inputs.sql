-- Migration: add calculator input fields and figures_saved_at to tax_years
-- Allows persisting the accountant's entered inputs alongside calculated figures.
-- figures_saved_at is used by evaluateReturn as a gate: nil = figures not yet reviewed.

alter table tax_years
  add column business_miles        numeric(10, 2),
  add column other_income          numeric(12, 2),
  add column tax_paid_at_source    numeric(12, 2) not null default 0,
  add column student_loan_plan     text,
  add column declaration_confirmed boolean not null default false,
  add column figures_saved_at      timestamptz;
