import type { ConfirmRequest, ConfirmResponse } from './fields'

/** The rules of profile §6.6 / FLOW-CONFIRM-001 on a request; returns the first violation or undefined. */
export function validateRequest(request: ConfirmRequest): string | undefined {
  if (typeof request.text !== 'string' || !request.text) return 'text is required'
  if (typeof request.code !== 'string' || !request.code) return 'code is required'
  if (typeof request.attested !== 'boolean') return 'attested must be a boolean'
  return undefined
}

/** On a response: `attestation.method` may be `none` only when `attested` was false (profile §6.5 applies to confirm, §10). */
export function validateResponse(request: ConfirmRequest, response: ConfirmResponse): string | undefined {
  if (typeof response.confirmed !== 'boolean') return 'confirmed must be a boolean'
  if (!response.attestation) return 'attestation is required'
  if (request.attested && response.attestation.method === 'none') {
    return "attestation.method 'none' is not allowed on an attested request"
  }
  if (typeof response.attestation.at !== 'string' || Number.isNaN(Date.parse(response.attestation.at))) {
    return 'attestation.at is invalid'
  }
  return undefined
}
