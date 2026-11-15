import { PEER_STATUS_REFUSAL_CODES, PEER_STATUS_RULES, type PeerStatus } from './fields'

/**
 * The rules of profile §4.1 on a status; returns the first violation or undefined. `strictRefusal` also checks the
 * refusal code against the codes of the profile: a notifier sends only those, a receiver accepts one it does not know.
 */
export function validateStatus(status: PeerStatus, options: { strictRefusal?: boolean } = {}): string | undefined {
  const authentication = status?.authentication
  if (!authentication || !PEER_STATUS_RULES.includes(authentication.rule))
    return `authentication.rule must be one of ${PEER_STATUS_RULES.join(', ')}`
  const schema = authentication.credential?.jsonSchemaCredentialId
  if (authentication.rule === 'none') {
    if (authentication.credential !== undefined) return 'authentication.credential is absent with the rule none'
  } else if (typeof schema !== 'string' || !schema) {
    return `authentication.credential.json_schema_credential_id is required with the rule ${authentication.rule}`
  }
  if (typeof status.identified !== 'boolean') return 'identified must be a boolean'
  if (!Array.isArray(status.open) || status.open.some((entry) => typeof entry !== 'string' || !entry))
    return 'open must be a list of names'
  if (new Set(status.open).size !== status.open.length) return 'open lists a name twice'
  if (status.refusal !== undefined) {
    if (typeof status.refusal.code !== 'string' || !status.refusal.code) return 'refusal.code is required'
    if (options.strictRefusal && !(PEER_STATUS_REFUSAL_CODES as readonly string[]).includes(status.refusal.code))
      return `refusal.code must be one of ${PEER_STATUS_REFUSAL_CODES.join(', ')}`
    if (status.refusal.comment !== undefined && typeof status.refusal.comment !== 'string')
      return 'refusal.comment must be a string'
    if (status.open.length) return 'open is empty with a refusal'
  }
  return undefined
}
