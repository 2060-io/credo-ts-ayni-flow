/**
 * The bodies of authenticate/1.0 (Ayni Flow Profile 1.0 §6.14, §6.4), as the API takes and gives them: camelCase, ISO
 * 8601 dates as strings. The wire is snake_case, as the profile writes it; the message classes convert.
 */

/** Why the service asks (§6.14). */
export const AUTHENTICATE_PURPOSES = ['connection', 'visitor', 'step-up', 'admin', 'enrol'] as const
export type AuthenticatePurpose = (typeof AUTHENTICATE_PURPOSES)[number]

/** The types of an authentication method (§4.1, §6.14). */
export const AUTHENTICATION_METHOD_TYPES = [
  'credential',
  'email',
  'document',
  'face-match',
  'authenticator-app',
  'passkey',
] as const
export type AuthenticationMethodType = (typeof AUTHENTICATION_METHOD_TYPES)[number]

/**
 * The types that only confirm an identity another method found (§6.14: a step-up's set "may hold confirming methods
 * only (`face-match`, `authenticator-app`)"); the others find one. The service runs the identifying methods of a
 * combination first, in the order it lists them, then the confirming ones (FLOW-SIGNIN-008).
 */
export const CONFIRMING_METHOD_TYPES: readonly string[] = ['face-match', 'authenticator-app']
export const IDENTIFYING_METHOD_TYPES: readonly string[] = ['credential', 'email', 'document', 'passkey']

/** The types a person enrols with a service (§6.4). */
export const ENROLLABLE_METHOD_TYPES = ['authenticator-app', 'passkey'] as const
export type EnrollableMethodType = (typeof ENROLLABLE_METHOD_TYPES)[number]

/** What a `step` asks the holder to answer with an `answer` (§6.14); a step of the other types has its own carrier. */
export const AUTHENTICATE_STEP_ASKS = ['address', 'code', 'consent', 'assertion'] as const
export type AuthenticateStepAsk = (typeof AUTHENTICATE_STEP_ASKS)[number]

/** The `ask` a step of each type may carry; a `credential` and a `document` step carry none (§6.14). */
export const STEP_ASKS_BY_TYPE: Readonly<Record<string, readonly AuthenticateStepAsk[]>> = {
  credential: [],
  document: [],
  email: ['address', 'code'],
  'face-match': ['consent'],
  'authenticator-app': ['code'],
  passkey: ['assertion'],
}

/** A step sent again: a wrong code (email, authenticator app), or a new code refused (email). */
export const AUTHENTICATE_STEP_ERRORS = ['wrong-code', 'new-code-refused'] as const
export type AuthenticateStepError = (typeof AUTHENTICATE_STEP_ERRORS)[number]

/** Why a new code is refused (FLOW-SIGNIN-011). */
export const NEW_CODE_REFUSALS = ['too-soon', 'no-more'] as const
export type NewCodeRefusal = (typeof NEW_CODE_REFUSALS)[number]

export const AUTHENTICATE_STEP_OUTCOMES = ['passed', 'failed', 'expired'] as const
export type AuthenticateStepOutcome = (typeof AUTHENTICATE_STEP_OUTCOMES)[number]

/** `expires_time` of an `authenticate` flow: fifteen minutes after the `open`, the time of every step (§6.14). */
export const AUTHENTICATE_FLOW_EXPIRY_MS = 15 * 60 * 1000
/** A `choice` that does not come within five minutes leaves the request unanswered (§6.14, FLOW-SIGNIN-005). */
export const AUTHENTICATE_CHOICE_TIMEOUT_MS = 5 * 60 * 1000

/** The credential a `credential` method asks for, by the JSON schema credential of its schema. */
export interface AuthenticationCredential {
  jsonSchemaCredentialId: string
}

/** One method of a request, as in the peer status (§4.1). */
export interface AuthenticationMethod {
  type: AuthenticationMethodType | string
  /** A `credential` method only: the schema it asks for. */
  credential?: AuthenticationCredential
  /** A `credential` method only: the organizations whose credentials are accepted, by key; absent when any is. */
  issuers?: string[]
}

/** The `request` body (§6.14, FLOW-SIGNIN-001). */
export interface AuthenticateRequest {
  purpose: AuthenticatePurpose
  /** The methods, by the name the service gives each. */
  methods: Record<string, AuthenticationMethod>
  /** The accepted combinations, each a list of method names; for `step-up` and `admin`, the one set the action names. */
  combinations: string[][]
  /** What a `step-up` is for ("Confirm it's you to send 1 200 EUR"); required with `step-up`, optional otherwise. */
  text?: string
}

/** The `choice` body: the method names of the combination the person chose. */
export interface AuthenticateChoice {
  combination: string[]
}

/** The `step` body (§6.14): a step announced, or sent again after a wrong code or a refused new code. */
export interface AuthenticateStep {
  /** The step's id, the same in its `answer` and its `step-result`. */
  step: string
  /** The name of the method of the chosen combination the step runs. */
  method: string
  /** The method's type. */
  type: AuthenticationMethodType | string
  ask?: AuthenticateStepAsk
  /** `face-match` `consent`: the consent the person is asked for. */
  text?: string
  /** `email` `code`: until when the code is valid, ISO 8601. */
  expiresAt?: string
  /** `email` and `authenticator-app` `code`: the tries left. */
  triesLeft?: number
  /** `email` `code`: the new codes the person may still ask for. */
  newCodesLeft?: number
  /** `passkey` `assertion`: the challenge to sign, base64url. */
  challenge?: string
  /** `passkey` `assertion`: the relying party, the network's app-link domain (FLOW-SIGNIN-013). */
  rpId?: string
  /** The step is sent again after a wrong code, or a new code was refused. */
  error?: AuthenticateStepError
  /** With `new-code-refused`: why. */
  reason?: NewCodeRefusal
}

/** A passkey's assertion (WebAuthn), its binary fields base64url. */
export interface PasskeyAssertion {
  id: string
  clientDataJson: string
  authenticatorData: string
  signature: string
  userHandle: string | null
}

/** The `answer` body (§6.14): what the person gave for a step's `ask`. */
export interface AuthenticateAnswer {
  step: string
  /** `email` `address`, with the phone's `locale`. */
  address?: string
  locale?: string
  /** `email` or `authenticator-app` `code`. */
  code?: string
  /** `email` `code`: the person asks for a new code instead. */
  newCode?: boolean
  /** `face-match` `consent`: given; the holder answers only on the person's agreement (FLOW-SIGNIN-012). */
  consent?: boolean
  /** `passkey` `assertion`. */
  assertion?: PasskeyAssertion
}

/** The `step-result` body: the end of a step; `reason`, a code of §11, when it did not pass. */
export interface AuthenticateStepResult {
  step: string
  outcome: AuthenticateStepOutcome
  reason?: string
}

// ---- enrol (§6.4) -------------------------------------------------------------------------------

/** The `enrol-request` body. */
export interface EnrolRequest {
  type: EnrollableMethodType
}

/** The options of a passkey's creation (WebAuthn), the relying party being the network's app-link domain. */
export interface PasskeyCreationOptions {
  rp: { id: string; name?: string }
  /** `id` base64url. */
  user: { id: string; name: string; displayName: string }
  /** base64url */
  challenge: string
  pubKeyCredParams: { type: string; alg: number }[]
  authenticatorSelection?: { residentKey?: string; userVerification?: string }
}

/** The `enrol-challenge` body: a passkey's creation options, or an authenticator app's secret. */
export interface EnrolChallenge {
  type: EnrollableMethodType
  /** `passkey` */
  publicKey?: PasskeyCreationOptions
  /** `authenticator-app`: the secret, base32. */
  secret?: string
  /** `authenticator-app`: the `otpauth://` link that opens the person's authenticator app. */
  otpauthUri?: string
  /** `authenticator-app`: 6. */
  digits?: number
  /** `authenticator-app`: 30 (seconds). */
  period?: number
}

/** A passkey's attestation (WebAuthn), its binary fields base64url. */
export interface PasskeyAttestation {
  id: string
  clientDataJson: string
  attestationObject: string
}

/** The `enrol-answer` body: the passkey's attestation, or the code the authenticator app shows. */
export interface EnrolAnswer {
  attestation?: PasskeyAttestation
  code?: string
}

/** The `unenrol` body: the type the holder removes, outside any flow (§6.4). */
export interface Unenrol {
  type: EnrollableMethodType
}

// ---- wire conversion ------------------------------------------------------------------------------

const SNAKE: Record<string, string> = {
  jsonSchemaCredentialId: 'json_schema_credential_id',
  expiresAt: 'expires_at',
  triesLeft: 'tries_left',
  newCodesLeft: 'new_codes_left',
  rpId: 'rp_id',
  newCode: 'new_code',
  clientDataJson: 'client_data_json',
  authenticatorData: 'authenticator_data',
  userHandle: 'user_handle',
  attestationObject: 'attestation_object',
  publicKey: 'public_key',
  displayName: 'display_name',
  pubKeyCredParams: 'pub_key_cred_params',
  authenticatorSelection: 'authenticator_selection',
  residentKey: 'resident_key',
  userVerification: 'user_verification',
  otpauthUri: 'otpauth_uri',
}
const CAMEL: Record<string, string> = Object.fromEntries(Object.entries(SNAKE).map(([camel, snake]) => [snake, camel]))

/**
 * Renames the keys of a body between the API (camelCase) and the wire (snake_case), at every depth, leaving the method
 * names of a request's `methods` as they are; values that are not objects are kept as they came. Undefined values are
 * dropped: an absent field is absent from the wire.
 */
function renameKeys(value: unknown, names: Record<string, string>, keepKeysOf?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => renameKeys(item, names))
  if (typeof value !== 'object' || value === null) return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue
    if (key === keepKeysOf && typeof item === 'object' && item !== null && !Array.isArray(item)) {
      out[key] = Object.fromEntries(Object.entries(item).map(([name, method]) => [name, renameKeys(method, names)]))
      continue
    }
    out[names[key] ?? key] = renameKeys(item, names)
  }
  return out
}

/** A body of the API as it travels. */
export function toWire<T>(body: T): Record<string, unknown> {
  return renameKeys(body, SNAKE, 'methods') as Record<string, unknown>
}

/** A body of the API from what travelled. */
export function fromWire<T>(wire: Record<string, unknown>): T {
  return renameKeys(wire, CAMEL, 'methods') as T
}
