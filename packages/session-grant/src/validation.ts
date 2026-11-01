import { SESSION_GRANT_MAX_VALIDITY_MS, type SessionGrantRequest, type SessionGrantResponse } from './fields'

/** Clock skew tolerated between the two ends when checking `expires_at`. */
const CLOCK_SKEW_MS = 30_000

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** The rules of profile §6.8 on a request; returns the first violation or undefined. */
export function validateRequest(request: SessionGrantRequest): string | undefined {
  if (typeof request.agentDid !== 'string' || !request.agentDid.startsWith('did:')) return 'agent_did must be a DID'
  if (request.conversationId != null && typeof request.conversationId !== 'string')
    return 'conversation_id must be a string or null'
  if (typeof request.newConversation !== 'boolean') return 'new_conversation must be a boolean'
  if (!request.client?.description || !request.client?.platform || !request.client?.appVersion) {
    return 'client.description, client.platform and client.app_version are required'
  }
  return undefined
}

/** On a grant (FLOW-GRANT-001): an opaque grant, an HTTPS sessions URL, an `expires_at` at most sixty seconds away. */
export function validateResponse(_request: SessionGrantRequest, response: SessionGrantResponse): string | undefined {
  if (typeof response.grant !== 'string' || !response.grant) return 'grant is required'
  if (!isHttpsUrl(response.sessionsUrl)) return 'sessions_url must be an HTTPS URL'
  if (typeof response.expiresAt !== 'string' || Number.isNaN(Date.parse(response.expiresAt)))
    return 'expires_at is invalid'
  const validity = Date.parse(response.expiresAt) - Date.now()
  if (validity > SESSION_GRANT_MAX_VALIDITY_MS + CLOCK_SKEW_MS) return 'expires_at must be at most sixty seconds away'
  return undefined
}
