import type { AuthorizeApprovals, AuthorizeRequest, AuthorizeResponse } from './fields'

/** The rules of profile §6.5 / FLOW-AUTH-001 on a request; returns the first violation or undefined. */
export function validateRequest(request: AuthorizeRequest): string | undefined {
  if (!request.requester?.name) return 'requester.name is required'
  if (!request.purpose?.id || !request.purpose?.label) return 'purpose.id and purpose.label are required'
  if (typeof request.justification !== 'string') return 'justification is required'
  if (!Array.isArray(request.scope)) return 'scope must be an array'
  if (typeof request.expiresAt !== 'string' || Number.isNaN(Date.parse(request.expiresAt)))
    return 'expires_at is invalid'
  if (typeof request.attested !== 'boolean') return 'attested must be a boolean'
  if (request.approvals !== undefined) return validateApprovals(request.approvals)
  return undefined
}

/**
 * The rules of profile §6.5 on `approvals` (FLOW-AUTH-004): a whole number of approvals needed, at least one and at
 * most what the approvers asked can give (the others, and the person who receives the request); each other approver
 * named by `name` or by `label`, exactly one of the two, and `required` or not.
 */
export function validateApprovals(approvals: AuthorizeApprovals): string | undefined {
  if (typeof approvals !== 'object' || approvals === null) return 'approvals must be an object'
  if (typeof approvals.own !== 'boolean') return 'approvals.own must be a boolean'
  if (!Array.isArray(approvals.others)) return 'approvals.others must be a list'
  for (const [index, other] of approvals.others.entries()) {
    const named = typeof other?.name === 'string' && other.name !== ''
    const labelled = typeof other?.label === 'string' && other.label !== ''
    if (named === labelled) return `approvals.others[${index}] carries a name or a label, exactly one of the two`
    if (typeof other.required !== 'boolean') return `approvals.others[${index}].required must be a boolean`
  }
  if (!Number.isInteger(approvals.threshold) || approvals.threshold < 1)
    return 'approvals.threshold must be a whole number of at least 1'
  if (approvals.threshold > approvals.others.length + 1)
    return 'approvals.threshold is more than the approvers asked can give'
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
