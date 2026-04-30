import { supabaseServer } from '@/lib/supabase/server'
import type { ClientDocument } from '@/types/dashboard'

const BUCKET = 'documents'

async function ensurePrivateBucket(): Promise<void> {
  const { error } = await supabaseServer.storage.createBucket(BUCKET, { public: false })
  if (error && !error.message.includes('already exists')) {
    console.warn('[documents] bucket creation:', error.message)
  }
}

export async function getUploadUrl(
  clientId: string,
  taxYear: string,
  fileName: string,
): Promise<{ signedUrl: string; path: string }> {
  await ensurePrivateBucket()

  const path = `${clientId}/${taxYear}/${Date.now()}-${fileName}`

  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) throw new Error(error?.message ?? 'Failed to create upload URL')
  return { signedUrl: data.signedUrl, path }
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseServer.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 300)

  if (error || !data) throw new Error(error?.message ?? 'Failed to create signed URL')
  return data.signedUrl
}

export async function createDocumentRecord(
  clientId: string,
  taxYear: string,
  category: string,
  storagePath: string,
  fileName: string,
  fileType: string,
  expenseAmount?: number,
): Promise<ClientDocument> {
  const needsReview = typeof expenseAmount === 'number' && expenseAmount > 200

  const { data, error } = await supabaseServer
    .from('documents')
    .insert({
      client_id:           clientId,
      tax_year:            taxYear,
      category,
      file_url:            storagePath,
      file_name:           fileName,
      file_type:           fileType,
      expense_amount:      expenseAmount ?? null,
      needs_review:        needsReview,
      accountant_reviewed: false,
      uploaded_by:         'accountant',
    })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return data as ClientDocument
}

export async function listClientDocuments(
  clientId: string,
  taxYear: string,
): Promise<ClientDocument[]> {
  const { data, error } = await supabaseServer
    .from('documents')
    .select('*')
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .order('upload_date', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as ClientDocument[]
}

export async function markClientDocumentReviewed(
  documentId: string,
  clientId: string,
  taxYear: string,
): Promise<void> {
  const { error } = await supabaseServer
    .from('documents')
    .update({ accountant_reviewed: true, needs_review: false })
    .eq('id', documentId)

  if (error) throw new Error(error.message)

  const { count } = await supabaseServer
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('tax_year', taxYear)
    .eq('needs_review', true)

  if ((count ?? 0) === 0) {
    await supabaseServer
      .from('flags')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('tax_year', taxYear)
      .eq('flag_type', 'document_over_200_unreviewed')
      .eq('status', 'open')
  }
}
