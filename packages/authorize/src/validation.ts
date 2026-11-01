import type { AuthorizeRequest, AuthorizeResponse } from './fields'

/** The rules of profile §6.5 / FLOW-AUTH-001 on a request; returns the first violation or undefined. */
export function validateRequest(request: AuthorizeRequest): string | undefined {
  if (!request.requester?.name) return 'requester.name is required'
  if (!request.purpose?.id || !request.purpose?.label) return 'purpose.id and purpose.label are required'
  if (typeof request.justification !== 'string') return 'justification is required'
  if (!Array.isArray(request.scope)) return 'scope must be an array'
  if (typeof request.expiresAt !== 'string' || Number.isNaN(Date.parse(request.expiresAt)))
    return 'expires_at is invalid'
  if (typeof request.attested !== 'boolean') return 'attested must be a boolean'
  return undefined
}

/** The rules of profile §6.5 / FLOW-AUTH-001 on a response: `attestation.method` may be `none` only when `attested` was false. */
export function validateResponse(request: AuthorizeRequest, response: AuthorizeResponse): string | undefined {
  if (!response.attestation) return 'attestation is required'
  if (request.attested && response.attestation.method === 'none') {
    return "attestation.method 'none' is not allowed on an attested request"
  }
  if (typeof response.attestation.at !== 'string' || Number.isNaN(Date.parse(response.attestation.at))) {
    return 'attestation.at is invalid'
  }
  return undefined
}
