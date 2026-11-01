import type { LinkSessionRequest, LinkSessionResponse } from './fields'

function isUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

/** The rules of profile §6.7 / FLOW-LINK-001 and FLOW-LINK-003 on a request; returns the first violation or undefined. */
export function validateRequest(request: LinkSessionRequest): string | undefined {
  if (!request.agent?.did || !request.agent?.name) return 'agent.did and agent.name are required'
  if (!request.browser?.description || !request.browser?.platform)
    return 'browser.description and browser.platform are required'
  if (!isUrl(request.webOrigin)) return 'web_origin must be a URL'
  if (typeof request.startedAt !== 'string' || Number.isNaN(Date.parse(request.startedAt)))
    return 'started_at is invalid'
  if (typeof request.invitationId !== 'string' || !request.invitationId) return 'invitation_id is required'
  if (request.codes != null) {
    if (!Array.isArray(request.codes) || request.codes.length !== 3) return 'codes must hold three codes'
    if (request.codes.some((code) => typeof code !== 'string' || !code)) return 'codes must be non-empty strings'
    if (new Set(request.codes).size !== 3) return 'codes must be distinct'
  }
  return undefined
}

/** On a response: a `link: true` to a request that carried `codes` must name the picked `code` (FLOW-LINK-003). */
export function validateResponse(request: LinkSessionRequest, response: LinkSessionResponse): string | undefined {
  if (typeof response.link !== 'boolean') return 'link must be a boolean'
  if (response.link && request.codes && !response.code) return 'code is required when the request carried codes'
  return undefined
}

/**
 * Whether the agent may bind the session (profile §6.7): `link` is true and, when the request carried `codes`, `code` is the
 * session's code. Any other answer leaves the session provisional.
 */
export function mayBind(request: LinkSessionRequest, response: LinkSessionResponse, sessionCode?: string): boolean {
  if (!response.link) return false
  if (!request.codes) return true
  return sessionCode !== undefined && response.code === sessionCode && request.codes.includes(sessionCode)
}
