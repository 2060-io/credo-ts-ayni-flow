import {
  PEER_STATUS_ENROLLABLE_TYPES,
  PEER_STATUS_METHOD_TYPES,
  PEER_STATUS_REFUSAL_CODES,
  PEER_STATUS_RULES,
  type PeerStatus,
  type PeerStatusAuthentication,
} from './fields'

export interface ValidateStatusOptions {
  /**
   * Also checks the refusal code against the codes of the profile: a notifier sends only those, a receiver accepts one
   * it does not know.
   */
  strictRefusal?: boolean
  /**
   * Also checks the method types, and the types of `enrol` and `enrolled`, against those of the profile: a notifier
   * sends only those, a receiver accepts one it does not know (more types come later) and cannot complete it.
   */
  strictTypes?: boolean
  /**
   * Also checks `issuable` as a notifier sends it: to an identified receiver only, absent rather than empty, each
   * schema once. A receiver takes such a list as it comes.
   */
  strictIssuable?: boolean
}

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''

/** The rules of profile §4.1 on a status; returns the first violation or undefined. */
export function validateStatus(status: PeerStatus, options: ValidateStatusOptions = {}): string | undefined {
  const authentication = status?.authentication
  if (!authentication || !PEER_STATUS_RULES.includes(authentication.rule))
    return `authentication.rule must be one of ${PEER_STATUS_RULES.join(', ')}`
  const invalidAuthentication = validateAuthentication(authentication, options)
  if (invalidAuthentication) return invalidAuthentication
  if (typeof status.identified !== 'boolean') return 'identified must be a boolean'
  if (!status.identified && (authentication.enrol !== undefined || authentication.enrolled !== undefined))
    return 'authentication.enrol and authentication.enrolled are sent to an identified receiver only'
  if (!Array.isArray(status.open) || status.open.some((entry) => !isText(entry))) return 'open must be a list of names'
  if (new Set(status.open).size !== status.open.length) return 'open lists a name twice'
  const invalidIssuable = validateIssuable(status, options)
  if (invalidIssuable) return invalidIssuable
  if (status.refusal !== undefined) {
    if (!isText(status.refusal.code)) return 'refusal.code is required'
    if (options.strictRefusal && !(PEER_STATUS_REFUSAL_CODES as readonly string[]).includes(status.refusal.code))
      return `refusal.code must be one of ${PEER_STATUS_REFUSAL_CODES.join(', ')}`
    if (status.refusal.comment !== undefined && typeof status.refusal.comment !== 'string')
      return 'refusal.comment must be a string'
    if (status.open.length) return 'open is empty with a refusal'
  }
  return undefined
}

function validateAuthentication(
  authentication: PeerStatusAuthentication,
  options: ValidateStatusOptions
): string | undefined {
  const { rule, methods, combinations, obtain } = authentication
  if (rule === 'none') {
    if (methods !== undefined) return 'authentication.methods is absent with the rule none'
    if (combinations !== undefined) return 'authentication.combinations is absent with the rule none'
    if (obtain !== undefined) return 'authentication.obtain is absent with the rule none'
  } else {
    const invalidMethods = validateMethods(authentication, options)
    if (invalidMethods) return invalidMethods
  }
  if (obtain !== undefined) {
    if (typeof obtain !== 'object' || obtain === null) return 'authentication.obtain must be an object'
    if (obtain.text !== undefined && !isText(obtain.text)) return 'authentication.obtain.text must be a text'
    if (obtain.url !== undefined && (typeof obtain.url !== 'string' || !/^https:\/\//.test(obtain.url)))
      return 'authentication.obtain.url must be an https link'
    if (obtain.text === undefined && obtain.url === undefined)
      return 'authentication.obtain carries a text, a link, or both'
  }
  for (const field of ['enrol', 'enrolled'] as const) {
    const types = authentication[field]
    if (types === undefined) continue
    if (!Array.isArray(types) || types.some((type) => !isText(type)))
      return `authentication.${field} must be a list of method types`
    if (new Set(types).size !== types.length) return `authentication.${field} lists a type twice`
    if (
      options.strictTypes &&
      types.some((type) => !(PEER_STATUS_ENROLLABLE_TYPES as readonly string[]).includes(type))
    )
      return `authentication.${field} lists only ${PEER_STATUS_ENROLLABLE_TYPES.join(', ')}`
  }
  return undefined
}

/**
 * The methods and combinations of a rule other than `none` (profile §4.1): at least one method, each of a type, a
 * `credential` method naming its schema and, when it lists organizations, at least one, each once; at least one
 * combination, each a list of the names of methods of the status, none twice.
 */
function validateMethods(authentication: PeerStatusAuthentication, options: ValidateStatusOptions): string | undefined {
  const { rule, methods, combinations } = authentication
  if (typeof methods !== 'object' || methods === null || Array.isArray(methods) || !Object.keys(methods).length)
    return `authentication.methods is required with the rule ${rule}`
  for (const [name, method] of Object.entries(methods)) {
    const at = `authentication.methods.${name}`
    if (!name) return 'authentication.methods has a method with no name'
    if (typeof method !== 'object' || method === null) return `${at} must be an object`
    if (!isText(method.type)) return `${at}.type is required`
    if (options.strictTypes && !(PEER_STATUS_METHOD_TYPES as readonly string[]).includes(method.type))
      return `${at}.type must be one of ${PEER_STATUS_METHOD_TYPES.join(', ')}`
    if (method.type === 'credential') {
      if (!isText(method.credential?.jsonSchemaCredentialId))
        return `${at}.credential.json_schema_credential_id is required for a credential method`
    } else {
      if (method.credential !== undefined) return `${at}.credential is for a credential method only`
      if (method.issuers !== undefined) return `${at}.issuers is for a credential method only`
    }
    const { issuers } = method
    if (issuers !== undefined) {
      // an empty list would accept nobody: a notifier that accepts every accredited issuer sends no list
      if (!Array.isArray(issuers) || !issuers.length || issuers.some((key) => !isText(key)))
        return `${at}.issuers must be a list of organization keys, absent when any issuer is accepted`
      if (new Set(issuers).size !== issuers.length) return `${at}.issuers lists a key twice`
    }
  }
  if (!Array.isArray(combinations) || !combinations.length)
    return `authentication.combinations is required with the rule ${rule}`
  const seen = new Set<string>()
  for (const [index, combination] of combinations.entries()) {
    const at = `authentication.combinations[${index}]`
    if (!Array.isArray(combination) || !combination.length) return `${at} must be a list of method names`
    if (combination.some((name) => typeof name !== 'string' || !Object.hasOwn(methods, name)))
      return `${at} names a method the status does not list`
    if (new Set(combination).size !== combination.length) return `${at} names a method twice`
    const key = [...combination].sort().join('\u0000')
    if (seen.has(key)) return `${at} is listed twice`
    seen.add(key)
  }
  return undefined
}

/**
 * `issuable` (profile §4.1): a list of credentials, each by the JSON schema credential of its schema and the name a
 * person reads. A notifier sends it to an identified receiver only, and none rather than an empty list.
 */
function validateIssuable(status: PeerStatus, options: ValidateStatusOptions): string | undefined {
  const { issuable } = status
  if (issuable === undefined) return undefined
  if (!Array.isArray(issuable)) return 'issuable must be a list'
  for (const [index, entry] of issuable.entries()) {
    const at = `issuable[${index}]`
    if (typeof entry !== 'object' || entry === null) return `${at} must be an object`
    if (!isText(entry.jsonSchemaCredentialId)) return `${at}.json_schema_credential_id is required`
    if (!isText(entry.label)) return `${at}.label is required`
  }
  if (options.strictIssuable) {
    if (!status.identified) return 'issuable is sent to an identified receiver only'
    if (!issuable.length) return 'issuable is absent when the notifier lists none'
    if (new Set(issuable.map((entry) => entry.jsonSchemaCredentialId)).size !== issuable.length)
      return 'issuable lists a schema twice'
  }
  return undefined
}
