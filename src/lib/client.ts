import { z } from 'zod'
import { supabaseServer as supabase } from '@/lib/supabase/server'

// ─── Schemas (single source of truth) ────────────────────────────────────────
//
// TypeScript types are derived from these schemas via z.infer.
// The same schema validates the raw JSON that arrives from the DB at runtime,
// so compile-time types and runtime data can never silently drift apart.

const ClientProfileSchema = z.object({
  id:                   z.string(),
  name:                 z.string(),
  utr:                  z.string().nullable(),
  business_type:        z.string(),
  email:                z.string().nullable(),
  mobile:               z.string().nullable(),
  ni_number:            z.string().nullable(),
  dob:                  z.string().nullable(),
  home_address:         z.string().nullable(),
  sa_registration_date: z.string().nullable(),
  first_year_filer:     z.boolean(),
  agent_authorised:     z.boolean(),
  aml_checked:          z.boolean(),
  loe_signed_date:      z.string().nullable(),
  tax_regime:           z.enum(['self_assessment', 'mtd']),
  form_version:         z.enum(['SA103S', 'SA103F']).nullable(),
  cash_fares:           z.boolean(),
  vat_registered:       z.boolean(),
  licence_type:         z.string().nullable(),
  hmrc_correspondence:  z.boolean(),
  mtd_signup_date:      z.string().nullable(),
  created_at:           z.string(),
})

const TaxYearSchema = z.object({
  id:                     z.string(),
  client_id:              z.string(),
  tax_year:               z.string(),
  gross_income:           z.number().nullable(),
  total_expenses:         z.number().nullable(),
  net_profit:             z.number().nullable(),
  income_tax:             z.number().nullable(),
  class2_nic:             z.number().nullable(),
  class4_nic:             z.number().nullable(),
  student_loan_repayment: z.number().nullable(),
  total_liability:        z.number().nullable(),
  poa1_amount:            z.number().nullable(),
  poa1_date:              z.string().nullable(),
  poa1_paid:              z.boolean(),
  poa2_amount:            z.number().nullable(),
  poa2_date:              z.string().nullable(),
  poa2_paid:              z.boolean(),
  balancing_payment:      z.number().nullable(),
  balancing_date:         z.string().nullable(),
  sa303_elected:          z.boolean(),
  sa303_reduced_amount:   z.number().nullable(),
  losses_brought_forward: z.number(),
  losses_carried_forward: z.number(),
  overlap_relief_claimed: z.number(),
  sa302_url:              z.string().nullable(),
  sa302_unavailable:      z.boolean(),
  hmrc_submission_ref:    z.string().nullable(),
  submitted_at:           z.string().nullable(),
  accountant_approved_at: z.string().nullable(),
  mtd_flag:               z.boolean(),
  mtd_penalty_points:     z.number(),
  return_status:          z.enum(['collecting', 'ready_for_review', 'under_review', 'approved', 'submitted']),
  business_miles:         z.number().nullable(),
  other_income:           z.number().nullable(),
  tax_paid_at_source:     z.number(),
  student_loan_plan:      z.string().nullable(),
  declaration_confirmed:  z.boolean(),
  figures_saved_at:       z.string().nullable(),
})

const VehicleSchema = z.object({
  id:                    z.string(),
  client_id:             z.string(),
  registration:          z.string(),
  make:                  z.string().nullable(),
  model:                 z.string().nullable(),
  fuel_type:             z.string().nullable(),
  co2_gkm:               z.number().nullable(),
  purchase_date:         z.string().nullable(),
  purchase_price:        z.number().nullable(),
  is_new:                z.boolean(),
  ownership_type:        z.enum(['own', 'rent', 'other']),
  expense_method:        z.enum(['mileage', 'actual', 'rental']).nullable(),
  expense_method_locked: z.boolean(),
  business_use_percent:  z.number().nullable(),
  disposal_date:         z.string().nullable(),
  disposal_proceeds:     z.number().nullable(),
})

const FlagSchema = z.object({
  id:              z.string(),
  client_id:       z.string(),
  tax_year:        z.string().nullable(),
  flag_type:       z.string(),
  description:     z.string(),
  status:          z.enum(['open', 'resolved', 'overridden', 'held']),
  raised_at:       z.string(),
  resolved_at:     z.string().nullable(),
  override_reason: z.string().nullable(),
})

const DocumentStatusSchema = z.object({
  category:           z.string(),
  count:              z.number(),
  needs_review_count: z.number(),
})

const ClientSummarySchema = z.object({
  profile:          ClientProfileSchema,
  current_tax_year: TaxYearSchema.nullable(),
  vehicles:         z.array(VehicleSchema),
  student_loans:    z.array(z.object({
    id:        z.string(),
    plan_type: z.enum(['plan1', 'plan2', 'plan4', 'pgl']),
    active:    z.boolean(),
  })),
  platforms: z.array(z.object({
    id:       z.string(),
    platform: z.enum(['uber', 'bolt', 'freenow', 'ola']),
    active:   z.boolean(),
  })),
  open_flags:      z.array(FlagSchema),
  open_flag_count: z.number(),
  document_status: z.array(DocumentStatusSchema),
})

// ─── Exported types (derived from schemas) ────────────────────────────────────

export type ClientProfile    = z.infer<typeof ClientProfileSchema>
export type TaxYear          = z.infer<typeof TaxYearSchema>
export type Vehicle          = z.infer<typeof VehicleSchema>
export type Flag             = z.infer<typeof FlagSchema>
export type DocumentStatus   = z.infer<typeof DocumentStatusSchema>
export type ClientSummary    = z.infer<typeof ClientSummarySchema>

export type ExpenseMethod = NonNullable<Vehicle['expense_method']>
export type OwnershipType = Vehicle['ownership_type']
export type Platform      = ClientSummary['platforms'][number]['platform']
export type StudentLoan   = ClientSummary['student_loans'][number]['plan_type']
export type FlagStatus    = Flag['status']

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getClientSummary(clientId: string): Promise<ClientSummary> {
  const { data, error } = await supabase.rpc('get_client_summary', {
    p_client_id: clientId,
  })

  if (error) throw new Error(`[client] get_client_summary failed: ${error.message}`)
  if (!data)  throw new Error(`[client] no data returned for client ${clientId}`)

  const result = ClientSummarySchema.safeParse(data)
  if (!result.success) {
    throw new Error(
      `[client] get_client_summary returned unexpected shape: ${result.error.message}`,
    )
  }
  return result.data
}

export async function getClientTaxYear(
  clientId: string,
  taxYear: string,
): Promise<TaxYear | null> {
  const { data, error } = await supabase
    .from('tax_years')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .maybeSingle()

  if (error) throw new Error(`[client] getClientTaxYear failed: ${error.message}`)
  if (!data)  return null

  const result = TaxYearSchema.safeParse(data)
  if (!result.success) {
    throw new Error(
      `[client] tax_years row has unexpected shape: ${result.error.message}`,
    )
  }
  return result.data
}

export async function getClientVehicles(clientId: string): Promise<Vehicle[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('client_id', clientId)
    .order('purchase_date', { ascending: false })

  if (error) throw new Error(`[client] getClientVehicles failed: ${error.message}`)

  return z.array(VehicleSchema).parse(data ?? [])
}

export async function getOpenFlags(clientId: string): Promise<Flag[]> {
  const { data, error } = await supabase
    .from('flags')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'open')
    .order('raised_at', { ascending: false })

  if (error) throw new Error(`[client] getOpenFlags failed: ${error.message}`)

  return z.array(FlagSchema).parse(data ?? [])
}
