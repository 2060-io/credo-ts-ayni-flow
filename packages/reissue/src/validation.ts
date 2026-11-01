import type { ReissueRequest } from './fields'

/** The rules of profile §6.11 / FLOW-REISSUE-001 on a request; returns the first violation or undefined. */
export function validateRequest(request: ReissueRequest): string | undefined {
  const reference = request.reference
  if (!reference) return 'reference is required'
  if (!reference.credentialId) return 'reference.credential_id is required'
  if (!reference.schemaId) return 'reference.schema_id is required'
  if (!reference.credDefId) return 'reference.cred_def_id is required'
  if (typeof reference.issuedAt !== 'string' || Number.isNaN(Date.parse(reference.issuedAt)))
    return 'reference.issued_at is invalid'
  if (typeof request.reason !== 'string' || !request.reason) return 'reason is required'
  return undefined
}
