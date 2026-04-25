-- Migration: get_client_summary RPC
-- Returns a single JSON object with everything needed to render a client's dashboard.
-- Transactions and documents are excluded — they are paginated separately.

create or replace function get_client_summary(p_client_id uuid)
returns json
language plpgsql
stable
as $$
declare
  v_profile          json;
  v_current_tax_year json;
  v_vehicles         json;
  v_student_loans    json;
  v_platforms        json;
  v_open_flags       json;
  v_open_flag_count  bigint;
  v_document_status  json;
begin
  select row_to_json(c)
    into v_profile
    from clients c
   where c.id = p_client_id;

  select row_to_json(t)
    into v_current_tax_year
    from tax_years t
   where t.client_id = p_client_id
   order by t.tax_year desc
   limit 1;

  select coalesce(json_agg(row_to_json(v)), '[]'::json)
    into v_vehicles
    from vehicles v
   where v.client_id = p_client_id
     and v.disposal_date is null;

  select coalesce(json_agg(row_to_json(l)), '[]'::json)
    into v_student_loans
    from student_loans l
   where l.client_id = p_client_id
     and l.active = true;

  select coalesce(json_agg(row_to_json(p)), '[]'::json)
    into v_platforms
    from client_platforms p
   where p.client_id = p_client_id
     and p.active = true;

  select coalesce(json_agg(row_to_json(f) order by f.raised_at desc), '[]'::json)
    into v_open_flags
    from flags f
   where f.client_id = p_client_id
     and f.status = 'open';

  select count(*)
    into v_open_flag_count
    from flags f
   where f.client_id = p_client_id
     and f.status = 'open';

  select coalesce(json_agg(
           json_build_object(
             'category',           d.category,
             'count',              d.doc_count,
             'needs_review_count', d.needs_review_count
           )
         ), '[]'::json)
    into v_document_status
    from (
      select
        category,
        count(*)                                        as doc_count,
        count(*) filter (where needs_review = true)     as needs_review_count
      from documents
      where client_id = p_client_id
      group by category
    ) d;

  return json_build_object(
    'profile',           v_profile,
    'current_tax_year',  v_current_tax_year,
    'vehicles',          v_vehicles,
    'student_loans',     v_student_loans,
    'platforms',         v_platforms,
    'open_flags',        v_open_flags,
    'open_flag_count',   v_open_flag_count,
    'document_status',   v_document_status
  );
end;
$$;
