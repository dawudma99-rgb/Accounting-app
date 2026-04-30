'use server'

import {
  createDocumentRecord,
  getDocumentUrl as fetchDocumentUrl,
  getUploadUrl as fetchUploadUrl,
  listClientDocuments,
  markClientDocumentReviewed,
} from '@/server/documents'
import type { ClientDocument } from './types'

export async function getUploadUrl(
  clientId: string,
  taxYear: string,
  fileName: string,
): Promise<{ signedUrl: string; path: string }> {
  return fetchUploadUrl(clientId, taxYear, fileName)
}

export async function getDocumentUrl(storagePath: string): Promise<string> {
  return fetchDocumentUrl(storagePath)
}

export async function saveDocumentRecord(
  clientId: string,
  taxYear: string,
  category: string,
  storagePath: string,
  fileName: string,
  fileType: string,
  expenseAmount?: number,
): Promise<ClientDocument> {
  return createDocumentRecord(clientId, taxYear, category, storagePath, fileName, fileType, expenseAmount)
}

export async function getClientDocuments(
  clientId: string,
  taxYear: string,
): Promise<ClientDocument[]> {
  return listClientDocuments(clientId, taxYear)
}

export async function markDocumentReviewed(
  documentId: string,
  clientId: string,
  taxYear: string,
): Promise<void> {
  return markClientDocumentReviewed(documentId, clientId, taxYear)
}
