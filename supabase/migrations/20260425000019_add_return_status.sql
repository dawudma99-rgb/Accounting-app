-- Migration: add return_status to tax_years
-- Enforces a state machine: collecting → ready_for_review → under_review → approved → submitted

alter table tax_years
  add column return_status text not null default 'collecting'
    check (return_status in ('collecting', 'ready_for_review', 'under_review', 'approved', 'submitted'));

create index tax_years_return_status_idx on tax_years (client_id, return_status);
