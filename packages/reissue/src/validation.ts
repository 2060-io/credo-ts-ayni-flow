import type { ReissueRequest } from './fields'

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/**
 * The rules of profile §6.11 / FLOW-REISSUE-001 on a request; returns the first violation or undefined. With the
 * reason `missing` the reference names the schema (`json_schema_credential_id`); with any other reason, the credential
 * of the backup (`credential_id`, `schema_id`, `cred_def_id`, `issued_at`).
 */
export function validateRequest(request: ReissueRequest): string | undefined {
  const reference = request.reference
  if (!reference) return 'reference is required'
  if (typeof request.reason !== 'string' || !request.reason) return 'reason is required'
  if (request.reason === 'missing') {
    if (!isText(reference.jsonSchemaCredentialId))
      return 'reference.json_schema_credential_id is required with the reason missing'
    return undefined
  }
  if (!reference.credentialId) return 'reference.credential_id is required'
  if (!reference.schemaId) return 'reference.schema_id is required'
  if (!reference.credDefId) return 'reference.cred_def_id is required'
  if (typeof reference.issuedAt !== 'string' || Number.isNaN(Date.parse(reference.issuedAt)))
    return 'reference.issued_at is invalid'
  return undefined
}
