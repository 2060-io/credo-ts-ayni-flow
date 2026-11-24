import {
  AUTHENTICATE_PURPOSES,
  AUTHENTICATE_STEP_ASKS,
  AUTHENTICATE_STEP_ERRORS,
  AUTHENTICATE_STEP_OUTCOMES,
  AUTHENTICATION_METHOD_TYPES,
  type AuthenticateAnswer,
  type AuthenticateChoice,
  type AuthenticateRequest,
  type AuthenticateStep,
  type AuthenticateStepResult,
  CONFIRMING_METHOD_TYPES,
  CONSENT_DECLINED,
  ENROL_AUTHENTICATOR_APP_ATTEMPTS,
  ENROL_CHALLENGE_ERRORS,
  ENROLLABLE_METHOD_TYPES,
  type EnrolAnswer,
  type EnrolChallenge,
  type EnrolRequest,
  IDENTIFYING_METHOD_TYPES,
  NEW_CODE_REFUSALS,
  STEP_ASKS_BY_TYPE,
  type Unenrol,
} from './fields'

const isText = (value: unknown): value is string => typeof value === 'string' && value !== ''
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0
const isInstant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value))
const known = (list: readonly string[], value: string) => list.includes(value)

export interface ValidateRequestOptions {
  /**
   * Also checks the method types against those of the profile: a service sends only those, a holder accepts a later
   * one and cannot complete a combination that holds it.
   */
  strictTypes?: boolean
}

/**
 * The rules of profile §6.14 on a `request`; returns the first violation or undefined. The methods and combinations as
 * in a peer status (§4.1); for `step-up` and `admin` the one set the action names, which may hold confirming methods
 * only, and a `text` that names a step-up's action; for `connection`, `visitor` and `enrol` combinations that each hold
 * an identifying method, and for `enrol` none that holds an `authenticator-app` or a `passkey`.
 */
export function validateRequest(
  request: AuthenticateRequest,
  options: ValidateRequestOptions = {}
): string | undefined {
  if (!known(AUTHENTICATE_PURPOSES, request?.purpose))
    return `purpose must be one of ${AUTHENTICATE_PURPOSES.join(', ')}`
  const { purpose, methods, combinations, text } = request
  if (text !== undefined && !isText(text)) return 'text must be a text'
  if (purpose === 'step-up' && text === undefined) return 'text names the action of a step-up'

  if (typeof methods !== 'object' || methods === null || Array.isArray(methods) || !Object.keys(methods).length)
    return 'methods is required'
  for (const [name, method] of Object.entries(methods)) {
    const at = `methods.${name}`
    if (typeof method !== 'object' || method === null) return `${at} must be an object`
    if (!isText(method.type)) return `${at}.type is required`
    if (options.strictTypes && !known(AUTHENTICATION_METHOD_TYPES, method.type))
      return `${at}.type must be one of ${AUTHENTICATION_METHOD_TYPES.join(', ')}`
    if (method.type === 'credential') {
      if (!isText(method.credential?.jsonSchemaCredentialId))
        return `${at}.credential.json_schema_credential_id is required for a credential method`
    } else {
      if (method.credential !== undefined) return `${at}.credential is for a credential method only`
      if (method.issuers !== undefined) return `${at}.issuers is for a credential method only`
    }
    if (method.issuers !== undefined) {
      if (!Array.isArray(method.issuers) || !method.issuers.length || method.issuers.some((key) => !isText(key)))
        return `${at}.issuers must be a list of organization keys, absent when any issuer is accepted`
      if (new Set(method.issuers).size !== method.issuers.length) return `${at}.issuers lists a key twice`
    }
  }

  if (!Array.isArray(combinations) || !combinations.length) return 'combinations is required'
  if ((purpose === 'step-up' || purpose === 'admin') && combinations.length !== 1)
    return `combinations holds the one set the action names with the purpose ${purpose}`
  const seen = new Set<string>()
  for (const [index, combination] of combinations.entries()) {
    const at = `combinations[${index}]`
    if (!Array.isArray(combination) || !combination.length) return `${at} must be a list of method names`
    if (combination.some((name) => typeof name !== 'string' || !Object.hasOwn(methods, name)))
      return `${at} names a method the request does not list`
    if (new Set(combination).size !== combination.length) return `${at} names a method twice`
    const key = [...combination].sort().join('\u0000')
    if (seen.has(key)) return `${at} is listed twice`
    seen.add(key)
    const types = combination.map((name) => methods[name].type)
    if (purpose === 'enrol' && types.some((type) => type === 'authenticator-app' || type === 'passkey'))
      return `${at} holds an authenticator-app or a passkey, which an enrol authentication does not`
    // a later type may identify; only a combination of known confirming types is known to identify nobody
    if (purpose !== 'step-up' && purpose !== 'admin' && types.every((type) => known(CONFIRMING_METHOD_TYPES, type)))
      return `${at} holds no identifying method (${IDENTIFYING_METHOD_TYPES.join(', ')})`
  }
  return undefined
}

/**
 * The combination of the request a `choice` names: the same method names, in any order. Undefined when the choice
 * is not one of the request's combinations, which the service refuses with `malformed` (FLOW-SIGNIN-008).
 */
export function findChosenCombination(request: AuthenticateRequest, choice: AuthenticateChoice): string[] | undefined {
  const chosen = choice?.combination
  if (!Array.isArray(chosen) || !chosen.length || chosen.some((name) => typeof name !== 'string')) return undefined
  if (new Set(chosen).size !== chosen.length) return undefined
  return request.combinations.find(
    (combination) => combination.length === chosen.length && combination.every((name) => chosen.includes(name))
  )
}

/**
 * The combinations a new `choice` may name after a declined consent (§6.14): those of the request that hold none of
 * the methods whose consent the person declined (`AuthenticateRecord.declinedMethods`).
 */
export function remainingCombinations(request: AuthenticateRequest, declinedMethods: readonly string[]): string[][] {
  return request.combinations.filter((combination) => !combination.some((name) => declinedMethods.includes(name)))
}

/**
 * The order in which the service runs the methods of a combination (§6.14, FLOW-SIGNIN-008): the identifying ones
 * first, in the order the combination lists them, then the confirming ones, in that order.
 */
export function runOrder(request: AuthenticateRequest, combination: string[]): string[] {
  const confirming = (name: string) => known(CONFIRMING_METHOD_TYPES, request.methods[name]?.type)
  return [...combination.filter((name) => !confirming(name)), ...combination.filter(confirming)]
}

/**
 * The rules of profile §6.14 on a `step` of the combination chosen: a method of it, of the request's type for that
 * method, with the `ask` of its type and the fields that `ask` needs; an `error` only on a code, `new-code-refused`
 * with its `reason`.
 */
export function validateStep(
  request: AuthenticateRequest,
  combination: string[],
  step: AuthenticateStep
): string | undefined {
  if (!isText(step?.step)) return 'step is required'
  if (!isText(step.method) || !combination.includes(step.method))
    return 'method must be a method of the combination chosen'
  if (step.type !== request.methods[step.method]?.type) return `type must be the type of the method ${step.method}`
  const asks = STEP_ASKS_BY_TYPE[step.type]
  if (step.ask !== undefined && !known(AUTHENTICATE_STEP_ASKS, step.ask))
    return `ask must be one of ${AUTHENTICATE_STEP_ASKS.join(', ')}`
  if (asks) {
    if (!asks.length && step.ask !== undefined)
      return `a step of type ${step.type} asks nothing: its carrier answers it`
    if (asks.length && (step.ask === undefined || !asks.includes(step.ask)))
      return `ask of a step of type ${step.type} must be one of ${asks.join(', ')}`
  }
  if (step.type === 'email' && step.ask === 'code') {
    if (!isInstant(step.expiresAt)) return 'expires_at is required on the code step of an email'
    if (!isCount(step.triesLeft)) return 'tries_left is required on the code step of an email'
    if (!isCount(step.newCodesLeft)) return 'new_codes_left is required on the code step of an email'
  } else if (step.newCodesLeft !== undefined) {
    return 'new_codes_left belongs to the code step of an email'
  }
  if (step.type === 'authenticator-app' && !isCount(step.triesLeft))
    return 'tries_left is required on the code step of an authenticator app'
  if (step.type === 'passkey' && (!isText(step.challenge) || !isText(step.rpId)))
    return 'challenge and rp_id are required on a passkey step'
  if (step.type === 'face-match' && !isText(step.text)) return 'text, the consent asked for, is required'
  if (step.error !== undefined) {
    if (!known(AUTHENTICATE_STEP_ERRORS, step.error))
      return `error must be one of ${AUTHENTICATE_STEP_ERRORS.join(', ')}`
    if (step.ask !== 'code') return 'error goes on a code step only'
    if (step.error === 'new-code-refused' && step.type !== 'email') return 'new-code-refused goes on an email step only'
  }
  if (step.error === 'new-code-refused') {
    if (!known(NEW_CODE_REFUSALS, step.reason as string))
      return `reason of new-code-refused must be one of ${NEW_CODE_REFUSALS.join(', ')}`
  } else if (step.reason !== undefined) {
    return 'reason goes with new-code-refused only'
  }
  return undefined
}

/** The rules of profile §6.14 on an `answer` to a step: the fields of the step's `ask`, and those alone. */
export function validateAnswer(step: AuthenticateStep, answer: AuthenticateAnswer): string | undefined {
  if (answer?.step !== step.step) return 'step must be the step answered'
  if (step.ask === undefined) return `a step of type ${step.type} is answered by its carrier, not by an answer`
  const given = (['address', 'locale', 'code', 'newCode', 'consent', 'assertion'] as const).filter(
    (field) => answer[field] !== undefined
  )
  const only = (...fields: string[]) => given.every((field) => fields.includes(field))
  switch (step.ask) {
    case 'address':
      if (!isText(answer.address) || !isText(answer.locale)) return 'address and locale are required'
      if (!only('address', 'locale')) return 'an address answer carries the address and the locale only'
      return undefined
    case 'code':
      if (answer.newCode !== undefined) {
        if (step.type !== 'email') return 'new_code is for the code of an email'
        if (answer.newCode !== true) return 'new_code is true when present'
        if (!only('newCode')) return 'a request for a new code carries nothing else'
        return undefined
      }
      if (!isText(answer.code)) return 'code is required'
      if (!only('code')) return 'a code answer carries the code only'
      return undefined
    case 'consent':
      // true on the person's agreement, false when the person declines (FLOW-SIGNIN-012)
      if (typeof answer.consent !== 'boolean')
        return 'consent is true (the person agrees) or false (the person declines)'
      if (!only('consent')) return 'a consent answer carries the consent only'
      return undefined
    case 'assertion': {
      const assertion = answer.assertion
      if (
        !assertion ||
        !isText(assertion.id) ||
        !isText(assertion.clientDataJson) ||
        !isText(assertion.authenticatorData) ||
        !isText(assertion.signature) ||
        !(assertion.userHandle === null || isText(assertion.userHandle))
      )
        return 'assertion carries id, client_data_json, authenticator_data, signature and user_handle'
      if (!only('assertion')) return 'an assertion answer carries the assertion only'
      return undefined
    }
    default:
      return `ask must be one of ${AUTHENTICATE_STEP_ASKS.join(', ')}`
  }
}

/**
 * The rules of profile §6.14 on a `step-result`: an outcome, and a reason when it is not `passed`. With the step it
 * ends (its last `answer`): a step whose consent the person declined ends `failed` `consent-declined`, and only such a
 * step ends `consent-declined`.
 */
export function validateStepResult(
  result: AuthenticateStepResult,
  step?: { answer?: AuthenticateAnswer }
): string | undefined {
  if (!isText(result?.step)) return 'step is required'
  if (!known(AUTHENTICATE_STEP_OUTCOMES, result.outcome))
    return `outcome must be one of ${AUTHENTICATE_STEP_OUTCOMES.join(', ')}`
  if (result.outcome === 'passed' && result.reason !== undefined) return 'a passed step carries no reason'
  if (result.outcome !== 'passed' && !isText(result.reason)) return `a ${result.outcome} step carries its reason`
  const declined = step?.answer?.consent === false
  if (result.reason === CONSENT_DECLINED) {
    if (result.outcome !== 'failed') return `${CONSENT_DECLINED} ends a step failed`
    if (step && !declined) return `${CONSENT_DECLINED} ends only a step whose consent the person declined`
  } else if (declined) {
    return `a step whose consent the person declined ends failed with ${CONSENT_DECLINED}`
  }
  return undefined
}

// ---- enrol (§6.4) -------------------------------------------------------------------------------

export function validateEnrolRequest(request: EnrolRequest | Unenrol): string | undefined {
  if (!known(ENROLLABLE_METHOD_TYPES, request?.type)) return `type must be one of ${ENROLLABLE_METHOD_TYPES.join(', ')}`
  return undefined
}

/**
 * The rules of profile §6.4 on an `enrol-challenge`: the type of the request; for a passkey the creation options
 * (relying party, user, challenge, algorithms), for an authenticator app the base32 secret, the `otpauth` link, six
 * digits and thirty seconds. An authenticator app's challenge sent again after a wrong code carries `error:
 * 'wrong-code'` and `triesLeft`, both or neither; a passkey's carries neither.
 *
 * With `previous`, the challenges of the exchange sent (or received) before this one, also its place: the first (0
 * before it) carries neither `error` nor `triesLeft`; a later one carries both, `triesLeft` being
 * `ENROL_AUTHENTICATOR_APP_ATTEMPTS - previous` (2, then 1); none follows the last code.
 */
export function validateEnrolChallenge(
  request: EnrolRequest,
  challenge: EnrolChallenge,
  previous?: number
): string | undefined {
  if (challenge?.type !== request.type) return `type must be the type of the request, ${request.type}`
  if (challenge.type === 'passkey') {
    const options = challenge.publicKey
    if (!options) return 'public_key is required for a passkey'
    if (!isText(options.rp?.id)) return 'public_key.rp.id is required'
    if (!isText(options.user?.id) || !isText(options.user?.name) || !isText(options.user?.displayName))
      return 'public_key.user carries id, name and display_name'
    if (!isText(options.challenge)) return 'public_key.challenge is required'
    if (
      !Array.isArray(options.pubKeyCredParams) ||
      !options.pubKeyCredParams.length ||
      options.pubKeyCredParams.some((param) => !isText(param?.type) || !Number.isInteger(param?.alg))
    )
      return 'public_key.pub_key_cred_params lists at least one type and alg'
    if (
      [
        challenge.secret,
        challenge.otpauthUri,
        challenge.digits,
        challenge.period,
        challenge.error,
        challenge.triesLeft,
      ].some((v) => v !== undefined)
    )
      return 'a passkey challenge carries public_key only'
    return undefined
  }
  if (challenge.publicKey !== undefined) return 'public_key is for a passkey'
  if (!isText(challenge.secret) || !/^[A-Z2-7]+=*$/i.test(challenge.secret)) return 'secret is a base32 text'
  if (!isText(challenge.otpauthUri) || !challenge.otpauthUri.startsWith('otpauth://'))
    return 'otpauth_uri is an otpauth link'
  if (challenge.digits !== 6) return 'digits is 6'
  if (challenge.period !== 30) return 'period is 30'
  if (challenge.error !== undefined && !known(ENROL_CHALLENGE_ERRORS, challenge.error))
    return `error must be one of ${ENROL_CHALLENGE_ERRORS.join(', ')}`
  if (challenge.triesLeft !== undefined && !isCount(challenge.triesLeft)) return 'tries_left is a whole number'
  if ((challenge.error === undefined) !== (challenge.triesLeft === undefined))
    return 'error and tries_left go together, on a challenge sent again after a wrong code'
  if (previous !== undefined) {
    if (previous >= ENROL_AUTHENTICATOR_APP_ATTEMPTS)
      return `an authenticator app's enrolment takes ${ENROL_AUTHENTICATOR_APP_ATTEMPTS} codes in all`
    if (previous === 0 && challenge.error !== undefined) return 'the first challenge carries no error and no tries_left'
    if (previous > 0 && challenge.error === undefined)
      return 'a challenge sent again after a wrong code carries error wrong-code and tries_left'
    if (previous > 0 && challenge.triesLeft !== ENROL_AUTHENTICATOR_APP_ATTEMPTS - previous)
      return `tries_left is ${ENROL_AUTHENTICATOR_APP_ATTEMPTS - previous}, the codes left of ${ENROL_AUTHENTICATOR_APP_ATTEMPTS}`
  }
  return undefined
}

/** The rules of profile §6.4 on an `enrol-answer`: the attestation of a passkey, or the code of an authenticator app. */
export function validateEnrolAnswer(request: EnrolRequest, answer: EnrolAnswer): string | undefined {
  if (request.type === 'passkey') {
    const attestation = answer?.attestation
    if (
      !attestation ||
      !isText(attestation.id) ||
      !isText(attestation.clientDataJson) ||
      !isText(attestation.attestationObject)
    )
      return 'attestation carries id, client_data_json and attestation_object'
    if (answer.code !== undefined) return 'a passkey answer carries the attestation only'
    return undefined
  }
  if (!isText(answer?.code) || !/^\d{6}$/.test(answer.code)) return 'code is the six digits the authenticator app shows'
  if (answer.attestation !== undefined) return 'an authenticator app answer carries the code only'
  return undefined
}
