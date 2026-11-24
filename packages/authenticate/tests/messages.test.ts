import { JsonTransformer } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import {
  AUTHENTICATE_ANSWER_TYPE,
  AUTHENTICATE_CHOICE_TYPE,
  AUTHENTICATE_ENROL_ANSWER_TYPE,
  AUTHENTICATE_ENROL_CHALLENGE_TYPE,
  AUTHENTICATE_ENROL_REQUEST_TYPE,
  AUTHENTICATE_REQUEST_TYPE,
  AUTHENTICATE_STEP_RESULT_TYPE,
  AUTHENTICATE_STEP_TYPE,
  AUTHENTICATE_UNENROL_TYPE,
  AuthenticateAnswerMessage,
  AuthenticateChoiceMessage,
  type AuthenticateRequest,
  AuthenticateRequestMessage,
  AuthenticateStepMessage,
  AuthenticateStepResultMessage,
  EnrolAnswerMessage,
  EnrolChallengeMessage,
  EnrolRequestMessage,
  findChosenCombination,
  runOrder,
  UnenrolMessage,
  validateAnswer,
  validateEnrolAnswer,
  validateEnrolChallenge,
  validateRequest,
  validateStep,
  validateStepResult,
} from '../src'

const BADGE = 'https://ecs.example/vt/schemas-badge-jsc.json'

/** The request of the profile §6.14 example. */
export const connectionRequest: AuthenticateRequest = {
  purpose: 'connection',
  methods: {
    badge: { type: 'credential', credential: { jsonSchemaCredentialId: BADGE } },
    passport: { type: 'document' },
    email: { type: 'email' },
    face: { type: 'face-match' },
  },
  combinations: [['badge'], ['passport'], ['email', 'face']],
}

const passkeyOptions = {
  rp: { id: 'app.ayni.org' },
  user: { id: 'dXNlcg', name: 'Ana Ríos', displayName: 'Ana Ríos' },
  challenge: 'Y2hhbGxlbmdl',
  pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
}

describe('authenticate/1.0 messages, as the profile writes them', () => {
  it('serialises the request of §6.14 and reads it back', () => {
    const json = JsonTransformer.toJSON(
      new AuthenticateRequestMessage({ ...connectionRequest, id: 'req-1', parentThreadId: 'f1ow-1' })
    )
    expect(json).toEqual({
      '@type': AUTHENTICATE_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      purpose: 'connection',
      methods: {
        badge: { type: 'credential', credential: { json_schema_credential_id: BADGE } },
        passport: { type: 'document' },
        email: { type: 'email' },
        face: { type: 'face-match' },
      },
      combinations: [['badge'], ['passport'], ['email', 'face']],
    })
    expect(JsonTransformer.fromJSON(json, AuthenticateRequestMessage).toRequest()).toEqual(connectionRequest)
    const stepUp = new AuthenticateRequestMessage({
      purpose: 'step-up',
      methods: { face: { type: 'face-match' } },
      combinations: [['face']],
      text: 'Confirm it is you to send 1 200 EUR',
    })
    expect(JsonTransformer.toJSON(stepUp).text).toBe('Confirm it is you to send 1 200 EUR')
  })

  it('serialises choice, step, answer and step-result as the §6.14 examples', () => {
    const thread = { threadId: 'req-1', parentThreadId: 'f1ow-1' }
    expect(
      JsonTransformer.toJSON(new AuthenticateChoiceMessage({ ...thread, id: 'c-1', combination: ['email', 'face'] }))
    ).toEqual({
      '@type': AUTHENTICATE_CHOICE_TYPE,
      '@id': 'c-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      combination: ['email', 'face'],
    })

    const step = {
      step: '1',
      method: 'email',
      type: 'email',
      ask: 'code' as const,
      expiresAt: '2026-11-24T10:12:00Z',
      triesLeft: 5,
      newCodesLeft: 3,
    }
    const stepJson = JsonTransformer.toJSON(new AuthenticateStepMessage({ ...thread, ...step, id: 's-1' }))
    expect(stepJson).toEqual({
      '@type': AUTHENTICATE_STEP_TYPE,
      '@id': 's-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      step: '1',
      method: 'email',
      type: 'email',
      ask: 'code',
      expires_at: '2026-11-24T10:12:00Z',
      tries_left: 5,
      new_codes_left: 3,
    })
    const parsed = JsonTransformer.fromJSON(stepJson, AuthenticateStepMessage)
    // the method's `type` does not take the place of the message's `@type`
    expect(parsed.type).toBe(AUTHENTICATE_STEP_TYPE)
    expect(parsed.toStep()).toEqual(step)
    const refused = { ...step, error: 'new-code-refused' as const, reason: 'too-soon' as const }
    expect(
      JsonTransformer.fromJSON(
        JsonTransformer.toJSON(new AuthenticateStepMessage({ ...thread, ...refused })),
        AuthenticateStepMessage
      ).toStep()
    ).toEqual(refused)
    const passkeyStep = {
      step: '2',
      method: 'key',
      type: 'passkey',
      ask: 'assertion' as const,
      challenge: 'q',
      rpId: 'app.ayni.org',
    }
    expect(JsonTransformer.toJSON(new AuthenticateStepMessage({ ...thread, ...passkeyStep }))).toMatchObject({
      challenge: 'q',
      rp_id: 'app.ayni.org',
    })

    expect(
      JsonTransformer.toJSON(new AuthenticateAnswerMessage({ ...thread, id: 'a-1', step: '1', code: '482913' }))
    ).toEqual({
      '@type': AUTHENTICATE_ANSWER_TYPE,
      '@id': 'a-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      step: '1',
      code: '482913',
    })
    const assertion = {
      id: 'cred-1',
      clientDataJson: 'e30',
      authenticatorData: 'YXV0aA',
      signature: 'c2ln',
      userHandle: 'dXNlcg',
    }
    const assertionJson = JsonTransformer.toJSON(new AuthenticateAnswerMessage({ ...thread, step: '2', assertion }))
    expect(assertionJson.assertion).toEqual({
      id: 'cred-1',
      client_data_json: 'e30',
      authenticator_data: 'YXV0aA',
      signature: 'c2ln',
      user_handle: 'dXNlcg',
    })
    expect(JsonTransformer.fromJSON(assertionJson, AuthenticateAnswerMessage).toAnswer()).toEqual({
      step: '2',
      assertion,
    })
    expect(
      JsonTransformer.toJSON(new AuthenticateAnswerMessage({ ...thread, step: '1', newCode: true })).new_code
    ).toBe(true)

    expect(
      JsonTransformer.toJSON(
        new AuthenticateStepResultMessage({ ...thread, id: 'r-1', step: '1', outcome: 'failed', reason: 'step-failed' })
      )
    ).toEqual({
      '@type': AUTHENTICATE_STEP_RESULT_TYPE,
      '@id': 'r-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      step: '1',
      outcome: 'failed',
      reason: 'step-failed',
    })
  })

  it('serialises the enrolment messages of §6.4, and unenrol outside any flow', () => {
    expect(
      JsonTransformer.toJSON(new EnrolRequestMessage({ id: 'e-1', parentThreadId: 'f1ow-2', type: 'passkey' }))
    ).toEqual({
      '@type': AUTHENTICATE_ENROL_REQUEST_TYPE,
      '@id': 'e-1',
      '~thread': { thid: 'e-1', pthid: 'f1ow-2' },
      type: 'passkey',
    })
    const challenge = new EnrolChallengeMessage({
      id: 'ch-1',
      threadId: 'e-1',
      parentThreadId: 'f1ow-2',
      type: 'passkey',
      publicKey: passkeyOptions,
    })
    const challengeJson = JsonTransformer.toJSON(challenge)
    expect(challengeJson).toEqual({
      '@type': AUTHENTICATE_ENROL_CHALLENGE_TYPE,
      '@id': 'ch-1',
      '~thread': { thid: 'e-1', pthid: 'f1ow-2' },
      type: 'passkey',
      public_key: {
        rp: { id: 'app.ayni.org' },
        user: { id: 'dXNlcg', name: 'Ana Ríos', display_name: 'Ana Ríos' },
        challenge: 'Y2hhbGxlbmdl',
        pub_key_cred_params: [{ type: 'public-key', alg: -7 }],
        authenticator_selection: { resident_key: 'required', user_verification: 'required' },
      },
    })
    expect(JsonTransformer.fromJSON(challengeJson, EnrolChallengeMessage).toChallenge()).toEqual({
      type: 'passkey',
      publicKey: passkeyOptions,
    })
    const app = {
      type: 'authenticator-app' as const,
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Acme:ana?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
      digits: 6,
      period: 30,
    }
    const appJson = JsonTransformer.toJSON(new EnrolChallengeMessage({ ...app, threadId: 'e-2' }))
    expect(appJson).toMatchObject({ type: 'authenticator-app', otpauth_uri: app.otpauthUri, digits: 6, period: 30 })
    expect(JsonTransformer.fromJSON(appJson, EnrolChallengeMessage).toChallenge()).toEqual(app)

    const attestation = { id: 'cred-1', clientDataJson: 'e30', attestationObject: 'bzE' }
    const answerJson = JsonTransformer.toJSON(
      new EnrolAnswerMessage({ id: 'ea-1', threadId: 'e-1', parentThreadId: 'f1ow-2', attestation })
    )
    expect(answerJson).toEqual({
      '@type': AUTHENTICATE_ENROL_ANSWER_TYPE,
      '@id': 'ea-1',
      '~thread': { thid: 'e-1', pthid: 'f1ow-2' },
      attestation: { id: 'cred-1', client_data_json: 'e30', attestation_object: 'bzE' },
    })
    expect(JsonTransformer.fromJSON(answerJson, EnrolAnswerMessage).toEnrolAnswer()).toEqual({ attestation })

    expect(JsonTransformer.toJSON(new UnenrolMessage({ id: 'u-1', type: 'authenticator-app' }))).toEqual({
      '@type': AUTHENTICATE_UNENROL_TYPE,
      '@id': 'u-1',
      type: 'authenticator-app',
    })
  })
})

describe('authenticate/1.0 rules', () => {
  it('holds a request to the purpose, the methods and the combinations (§6.14)', () => {
    expect(validateRequest(connectionRequest, { strictTypes: true })).toBeUndefined()
    const set = (fields: Partial<AuthenticateRequest>) => validateRequest({ ...connectionRequest, ...fields })
    expect(set({ purpose: 'login' as never })).toMatch(/purpose must be one of/)
    expect(set({ combinations: [['badge'], ['retina']] })).toMatch(/does not list/)
    expect(set({ combinations: [['badge'], ['badge']] })).toMatch(/listed twice/)
    expect(set({ combinations: [] })).toMatch(/combinations is required/)
    expect(set({ methods: {} })).toMatch(/methods is required/)
    // a face finds nobody: a combination of confirming methods alone identifies no one at connection
    expect(set({ combinations: [['face']] })).toMatch(/no identifying method/)
    expect(set({ methods: { ...connectionRequest.methods, badge: { type: 'credential' } } })).toMatch(
      /json_schema_credential_id/
    )
    // a step-up names its action and one set, which may hold confirming methods only
    const stepUp: AuthenticateRequest = {
      purpose: 'step-up',
      methods: { face: { type: 'face-match' }, app: { type: 'authenticator-app' } },
      combinations: [['face', 'app']],
      text: 'Confirm it is you to send 1 200 EUR',
    }
    expect(validateRequest(stepUp)).toBeUndefined()
    expect(validateRequest({ ...stepUp, text: undefined })).toMatch(/text names the action/)
    expect(validateRequest({ ...stepUp, combinations: [['face'], ['app']] })).toMatch(/one set/)
    expect(validateRequest({ ...stepUp, purpose: 'admin', text: undefined })).toBeUndefined()
    expect(validateRequest({ ...stepUp, purpose: 'admin', combinations: [['face'], ['app']] })).toMatch(/one set/)
    // before an enrolment: no authenticator app, no passkey
    const enrol: AuthenticateRequest = {
      purpose: 'enrol',
      methods: { email: { type: 'email' }, key: { type: 'passkey' } },
      combinations: [['email'], ['key']],
    }
    expect(validateRequest(enrol)).toMatch(/authenticator-app or a passkey/)
    expect(validateRequest({ ...enrol, combinations: [['email']] })).toBeUndefined()
    // a holder accepts a later type, a service sends only the types of the profile
    const later = { ...connectionRequest, methods: { ...connectionRequest.methods, iris: { type: 'iris' } } }
    expect(validateRequest(later)).toBeUndefined()
    expect(validateRequest(later, { strictTypes: true })).toMatch(/type must be one of/)
  })

  it('takes a choice in any order and runs the identifying methods first (FLOW-SIGNIN-008)', () => {
    expect(findChosenCombination(connectionRequest, { combination: ['face', 'email'] })).toEqual(['email', 'face'])
    expect(findChosenCombination(connectionRequest, { combination: ['face'] })).toBeUndefined()
    expect(findChosenCombination(connectionRequest, { combination: ['email', 'email'] })).toBeUndefined()
    const facesFirst = { ...connectionRequest, combinations: [['face', 'email']] }
    expect(runOrder(facesFirst, ['face', 'email'])).toEqual(['email', 'face'])
  })

  it('holds a step, its answer and its result to the rules of §6.14', () => {
    const combination = ['email', 'face']
    const step = (fields: Record<string, unknown>) =>
      validateStep(connectionRequest, combination, { step: '1', method: 'email', type: 'email', ...fields })
    expect(step({ ask: 'address' })).toBeUndefined()
    expect(step({ ask: 'code', expiresAt: '2026-11-24T10:12:00Z', triesLeft: 5, newCodesLeft: 3 })).toBeUndefined()
    expect(step({ ask: 'code', triesLeft: 5, newCodesLeft: 3 })).toMatch(/expires_at/)
    expect(step({ ask: 'consent' })).toMatch(/ask of a step of type email/)
    expect(step({ ask: 'address', error: 'wrong-code' })).toMatch(/code step only/)
    expect(
      step({ ask: 'code', expiresAt: '2026-11-24T10:12:00Z', triesLeft: 5, newCodesLeft: 0, error: 'new-code-refused' })
    ).toMatch(/too-soon, no-more/)
    expect(step({ method: 'badge', type: 'credential' })).toMatch(/combination chosen/)
    expect(step({ type: 'document' })).toMatch(/type must be the type/)
    expect(
      validateStep(connectionRequest, combination, { step: '2', method: 'face', type: 'face-match', ask: 'consent' })
    ).toMatch(/consent asked for/)
    expect(
      validateStep(connectionRequest, ['badge'], { step: '1', method: 'badge', type: 'credential', ask: 'code' })
    ).toMatch(/asks nothing/)

    const codeStep = { step: '1', method: 'email', type: 'email', ask: 'code' as const }
    expect(validateAnswer(codeStep, { step: '1', code: '482913' })).toBeUndefined()
    expect(validateAnswer(codeStep, { step: '1', newCode: true })).toBeUndefined()
    expect(validateAnswer(codeStep, { step: '1', newCode: true, code: '1' })).toMatch(/nothing else/)
    expect(validateAnswer(codeStep, { step: '2', code: '1' })).toMatch(/step answered/)
    expect(validateAnswer({ ...codeStep, ask: 'address' }, { step: '1', address: 'ana@acme.example' })).toMatch(
      /locale/
    )
    expect(validateAnswer({ ...codeStep, type: 'face-match', ask: 'consent' }, { step: '1', consent: false })).toMatch(
      /consent is true/
    )
    expect(validateAnswer({ step: '1', method: 'badge', type: 'credential' }, { step: '1', code: '1' })).toMatch(
      /answered by its carrier/
    )

    expect(validateStepResult({ step: '1', outcome: 'passed' })).toBeUndefined()
    expect(validateStepResult({ step: '1', outcome: 'failed' })).toMatch(/carries its reason/)
    expect(validateStepResult({ step: '1', outcome: 'passed', reason: 'x' })).toMatch(/no reason/)
    expect(validateStepResult({ step: '1', outcome: 'skipped' as never })).toMatch(/outcome must be one of/)
  })

  it('holds an enrolment to the rules of §6.4', () => {
    expect(validateEnrolChallenge({ type: 'passkey' }, { type: 'passkey', publicKey: passkeyOptions })).toBeUndefined()
    expect(
      validateEnrolChallenge(
        { type: 'passkey' },
        { type: 'passkey', publicKey: { ...passkeyOptions, rp: {} as never } }
      )
    ).toMatch(/rp.id/)
    expect(validateEnrolChallenge({ type: 'passkey' }, { type: 'authenticator-app' })).toMatch(/type of the request/)
    const app = {
      type: 'authenticator-app' as const,
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Acme:ana?secret=JBSWY3DPEHPK3PXP',
      digits: 6,
      period: 30,
    }
    expect(validateEnrolChallenge({ type: 'authenticator-app' }, app)).toBeUndefined()
    expect(validateEnrolChallenge({ type: 'authenticator-app' }, { ...app, digits: 8 })).toMatch(/digits is 6/)
    expect(validateEnrolChallenge({ type: 'authenticator-app' }, { ...app, secret: 'not base32!' })).toMatch(/base32/)
    expect(validateEnrolAnswer({ type: 'authenticator-app' }, { code: '123456' })).toBeUndefined()
    expect(validateEnrolAnswer({ type: 'authenticator-app' }, { code: '12345' })).toMatch(/six digits/)
    expect(validateEnrolAnswer({ type: 'passkey' }, { code: '123456' })).toMatch(/attestation carries/)
  })
})
