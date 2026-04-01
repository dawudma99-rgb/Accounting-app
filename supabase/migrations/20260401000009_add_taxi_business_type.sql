-- Migration: add 'taxi' to the clients business_type check constraint
-- The original constraint only allowed 'mechanic' | 'plumber'.

alter table clients drop constraint if exists clients_business_type_check;
alter table clients add constraint clients_business_type_check
  check (business_type in ('mechanic', 'plumber', 'taxi'));
