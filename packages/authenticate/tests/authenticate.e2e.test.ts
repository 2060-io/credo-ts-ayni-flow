import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import {
  AyniFlowClosedError,
  AyniFlowEventTypes,
  AyniFlowModule,
  AyniFlowRole,
  AyniFlowState,
  type AyniFlowStateChangedEvent,
} from '@ayni.org/credo-ts-didcomm-ayni-flow'
import type { Agent } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommMessage } from '@credo-ts/didcomm'
import { DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AuthenticateChoiceMessage,
  AuthenticateEventTypes,
  AuthenticateModule,
  type AuthenticateRecord,
  type AuthenticateRequest,
  AuthenticateRole,
  AuthenticateState,
  type AuthenticateStateChangedEvent,
  CONSENT_DECLINED,
  EnrolChallengeMessage,
  EnrolState,
  type EnrolStateChangedEvent,
  remainingCombinations,
  type UnenrolReceivedEvent,
} from '../src'

const BADGE = 'https://ecs.example/vt/schemas-badge-jsc.json'
const request: AuthenticateRequest = {
  purpose: 'connection',
  methods: {
    badge: { type: 'credential', credential: { jsonSchemaCredentialId: BADGE }, issuers: ['org:EE:12345678'] },
    passport: { type: 'document' },
    email: { type: 'email' },
    face: { type: 'face-match' },
  },
  combinations: [['badge'], ['passport'], ['face', 'email']],
}
const inFifteenMinutes = () => new Date(Date.now() + 15 * 60_000)

const modules = (flowRole: AyniFlowRole, roles: AuthenticateRole[]) => ({
  ayniFlow: new AyniFlowModule({ role: flowRole }),
  authenticate: new AuthenticateModule({ roles }),
})

describe('authenticate/1.0 inside an authenticate flow, between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let serviceConnection: DidCommConnectionRecord
  let holderConnection: DidCommConnectionRecord

  const authState = (agent: Agent<any>, state: AuthenticateState, threadId?: string) =>
    waitForEvent<AuthenticateStateChangedEvent>(
      agent,
      AuthenticateEventTypes.AuthenticateStateChanged,
      (e) => e.payload.record.state === state && (!threadId || e.payload.record.threadId === threadId)
    )
  const enrolState = (agent: Agent<any>, state: EnrolState, threadId?: string) =>
    waitForEvent<EnrolStateChangedEvent>(
      agent,
      AuthenticateEventTypes.EnrolStateChanged,
      (e) => e.payload.record.state === state && (!threadId || e.payload.record.threadId === threadId)
    )
  const flowState = (agent: Agent<any>, state: AyniFlowState, flowId: string) =>
    waitForEvent<AyniFlowStateChangedEvent>(
      agent,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (e) => e.payload.flowRecord.state === state && e.payload.flowRecord.flowId === flowId
    )
  /** Puts a message on the wire without the API's checks, as a peer that breaks the profile would. */
  const sendRaw = async (agent: Agent<any>, connectionRecord: DidCommConnectionRecord, message: DidCommMessage) =>
    agent.dependencyManager
      .resolve(DidCommMessageSender)
      .sendMessage(await getOutboundDidCommMessageContext(agent.context, { message, connectionRecord }))

  const openAuthenticate = async () => {
    const flow = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: 'authenticate',
      title: 'Authenticate to Acme',
      origin: { channel: 'none' },
      expiresTime: inFifteenMinutes(),
    })
    await flowState(holder, AyniFlowState.Pending, flow.flowId)
    const received = authState(holder, AuthenticateState.RequestReceived)
    const sent = await service.modules.authenticate.request({
      connectionId: serviceConnection.id,
      parentThreadId: flow.flowId,
      request,
    })
    await received
    return { flow, threadId: sent.threadId }
  }

  beforeAll(async () => {
    service = createTestAgent({
      name: 'svc',
      network,
      modules: modules(AyniFlowRole.Service, [AuthenticateRole.Requester]),
    })
    holder = createTestAgent({
      name: 'hld',
      network,
      modules: modules(AyniFlowRole.Holder, [AuthenticateRole.Authenticator]),
    })
    await service.initialize()
    await holder.initialize()
    ;[serviceConnection, holderConnection] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('discloses the protocol with its role on each side (§3)', async () => {
    const features = (agent: Agent<any>) =>
      agent.didcomm.features.query({ featureType: 'protocol', match: 'https://didcomm.org/authenticate/1.0' })
    expect(features(holder as Agent<any>)).toMatchObject([
      { id: 'https://didcomm.org/authenticate/1.0', roles: ['authenticator'] },
    ])
    expect(features(service as Agent<any>)).toMatchObject([
      { id: 'https://didcomm.org/authenticate/1.0', roles: ['requester'] },
    ])
  })

  it('runs email then face: a choice, the steps in order, a wrong code, a refused new code, the results (§6.14)', async () => {
    const { flow, threadId } = await openAuthenticate()
    const onHolder = await holder.modules.authenticate.getByThreadId(threadId)
    expect(onHolder.request).toEqual(request)
    expect(onHolder.flowId).toBe(flow.flowId)
    expect(onHolder.role).toBe(AuthenticateRole.Authenticator)

    // a combination the request does not list is refused before it leaves the phone
    await expect(holder.modules.authenticate.choose({ threadId, combination: ['face'] })).rejects.toThrow(/not one of/)

    const chosen = authState(service, AuthenticateState.ChoiceReceived, threadId)
    await holder.modules.authenticate.choose({ threadId, combination: ['email', 'face'] })
    // the record keeps the combination as the request lists it
    expect((await chosen).payload.record.combination).toEqual(['face', 'email'])

    // identifying methods first: the face confirms what the email found, so it runs second
    await expect(
      service.modules.authenticate.sendStep({
        threadId,
        step: { step: '1', method: 'face', type: 'face-match', ask: 'consent', text: 'May we film your face?' },
      })
    ).rejects.toThrow(/next step runs email/)

    const say = async (step: Parameters<typeof service.modules.authenticate.sendStep>[0]['step']) => {
      const received = authState(holder, AuthenticateState.StepReceived, threadId)
      await service.modules.authenticate.sendStep({ threadId, step })
      return (await received).payload.record
    }
    const answer = async (fields: Parameters<typeof holder.modules.authenticate.answer>[0]['answer']) => {
      const received = authState(service, AuthenticateState.AnswerReceived, threadId)
      await holder.modules.authenticate.answer({ threadId, answer: fields })
      return (await received).payload.record
    }

    let onHolderRecord = await say({ step: '1', method: 'email', type: 'email', ask: 'address' })
    expect(onHolderRecord.currentStep?.prompt).toEqual({ step: '1', method: 'email', type: 'email', ask: 'address' })
    await expect(holder.modules.authenticate.answer({ threadId, answer: { step: '1', code: '1' } })).rejects.toThrow(
      /address and locale/
    )
    let onService = await answer({ step: '1', address: 'ana@acme.example', locale: 'es-CO' })
    expect(onService.findStep('1')?.answer).toEqual({ step: '1', address: 'ana@acme.example', locale: 'es-CO' })
    // answered once, the step waits for nothing more until the service sends it again
    await expect(
      holder.modules.authenticate.answer({ threadId, answer: { step: '1', address: 'x@y.z', locale: 'es' } })
    ).rejects.toThrow(/waits for no answer/)

    const code = {
      step: '1',
      method: 'email',
      type: 'email',
      ask: 'code' as const,
      expiresAt: inFifteenMinutes().toISOString(),
    }
    await say({ ...code, triesLeft: 5, newCodesLeft: 3 })
    onService = await answer({ step: '1', code: '000000' })
    expect(onService.findStep('1')?.answer?.code).toBe('000000')
    onHolderRecord = await say({ ...code, triesLeft: 4, newCodesLeft: 3, error: 'wrong-code' })
    expect(onHolderRecord.currentStep?.prompt).toMatchObject({ error: 'wrong-code', triesLeft: 4 })
    onService = await answer({ step: '1', newCode: true })
    expect(onService.findStep('1')?.answer).toEqual({ step: '1', newCode: true })
    await say({ ...code, triesLeft: 4, newCodesLeft: 3, error: 'new-code-refused', reason: 'too-soon' })
    await answer({ step: '1', code: '482913' })

    // the face step waits until the email step passed
    await expect(
      service.modules.authenticate.sendStep({
        threadId,
        step: { step: '2', method: 'face', type: 'face-match', ask: 'consent', text: 'May we film your face?' },
      })
    ).rejects.toThrow(/has not passed/)
    const passed = authState(holder, AuthenticateState.StepResultReceived, threadId)
    await service.modules.authenticate.sendStepResult({ threadId, result: { step: '1', outcome: 'passed' } })
    expect((await passed).payload.record.findStep('1')?.result).toEqual({ step: '1', outcome: 'passed' })

    await say({ step: '2', method: 'face', type: 'face-match', ask: 'consent', text: 'May we film your face?' })
    // a consent is true or false, nothing else (FLOW-SIGNIN-012)
    await expect(
      holder.modules.authenticate.answer({ threadId, answer: { step: '2', consent: 'yes' as never } })
    ).rejects.toThrow(/true .* or false/)
    await answer({ step: '2', consent: true })
    // the call of the face match runs under the flow id through calls 1.0; then the result
    const faceResult = authState(holder, AuthenticateState.StepResultReceived, threadId)
    await service.modules.authenticate.sendStepResult({ threadId, result: { step: '2', outcome: 'passed' } })
    const done = (await faceResult).payload.record
    expect(done.steps.map((entry) => [entry.step, entry.method, entry.result?.outcome])).toEqual([
      ['1', 'email', 'passed'],
      ['2', 'face', 'passed'],
    ])
    // every method has run
    await expect(
      service.modules.authenticate.sendStep({
        threadId,
        step: { step: '3', method: 'email', type: 'email', ask: 'address' },
      })
    ).rejects.toThrow(/every method of the combination has run/)

    const completed = flowState(holder, AyniFlowState.Completed, flow.flowId)
    await service.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
    await completed
    expect((await service.modules.authenticate.findByFlowId(flow.flowId)).map((r) => r.threadId)).toEqual([threadId])
  })

  it('fails the exchange malformed on a choice that is not one of the combinations (FLOW-SIGNIN-008)', async () => {
    const { flow, threadId } = await openAuthenticate()
    const failed = authState(service, AuthenticateState.Failed, threadId)
    await sendRaw(
      holder as Agent<any>,
      holderConnection,
      new AuthenticateChoiceMessage({ threadId, parentThreadId: flow.flowId, combination: ['face'] })
    )
    const record = (await failed).payload.record
    expect(record.errorCode).toBe('malformed')
    expect(record.errorDescription).toMatch(/not one of the request's combinations/)
    // the service refuses it on the flow with the code
    const failedOnHolder = flowState(holder, AyniFlowState.Failed, flow.flowId)
    await service.modules.ayniFlow.sendProblemReport({ flowId: flow.flowId, code: 'malformed', description: 'x' })
    await failedOnHolder
  })

  /** Runs `[email, face]` up to the face step's consent, the email step passed. */
  const upToTheConsent = async () => {
    const opened = await openAuthenticate()
    const { threadId } = opened
    const chosen = authState(service, AuthenticateState.ChoiceReceived, threadId)
    await holder.modules.authenticate.choose({ threadId, combination: ['email', 'face'] })
    await chosen
    let received = authState(holder, AuthenticateState.StepReceived, threadId)
    await service.modules.authenticate.sendStep({
      threadId,
      step: { step: '1', method: 'email', type: 'email', ask: 'address' },
    })
    await received
    const answered = authState(service, AuthenticateState.AnswerReceived, threadId)
    await holder.modules.authenticate.answer({
      threadId,
      answer: { step: '1', address: 'ana@acme.example', locale: 'es-CO' },
    })
    await answered
    const passed = authState(holder, AuthenticateState.StepResultReceived, threadId)
    await service.modules.authenticate.sendStepResult({ threadId, result: { step: '1', outcome: 'passed' } })
    await passed
    received = authState(holder, AuthenticateState.StepReceived, threadId)
    await service.modules.authenticate.sendStep({ threadId, step: consentStep })
    await received
    return opened
  }
  const consentStep = {
    step: '2',
    method: 'face',
    type: 'face-match',
    ask: 'consent' as const,
    text: 'May we film your face?',
  }

  /** The holder declines the consent; the service ends the step consent-declined. Returns both records then. */
  const declineTheConsent = async (threadId: string) => {
    const answered = authState(service, AuthenticateState.AnswerReceived, threadId)
    await holder.modules.authenticate.answer({ threadId, answer: { step: '2', consent: false } })
    const onService = (await answered).payload.record
    const ended = authState(holder, AuthenticateState.StepResultReceived, threadId)
    await service.modules.authenticate.sendStepResult({
      threadId,
      result: { step: '2', outcome: 'failed', reason: CONSENT_DECLINED },
    })
    return { onService, onHolder: (await ended).payload.record as AuthenticateRecord }
  }

  it('takes a declined consent, ends the step consent-declined, and runs a new choice without the face (§6.14, FLOW-SIGNIN-012)', async () => {
    const { flow, threadId } = await upToTheConsent()

    // the person declines: the holder answers false, before any camera opens
    const answered = authState(service, AuthenticateState.AnswerReceived, threadId)
    await holder.modules.authenticate.answer({ threadId, answer: { step: '2', consent: false } })
    const onService = (await answered).payload.record
    expect(onService.findStep('2')?.answer).toEqual({ step: '2', consent: false })
    // the service neither asks the consent again nor ends the step otherwise than consent-declined
    await expect(service.modules.authenticate.sendStep({ threadId, step: consentStep })).rejects.toThrow(
      /declined the consent of step '2'/
    )
    await expect(
      service.modules.authenticate.sendStepResult({ threadId, result: { step: '2', outcome: 'passed' } })
    ).rejects.toThrow(/ends failed with consent-declined/)
    await expect(
      service.modules.authenticate.sendStepResult({
        threadId,
        result: { step: '2', outcome: 'failed', reason: 'step-failed' },
      })
    ).rejects.toThrow(/consent-declined/)
    const ended = authState(holder, AuthenticateState.StepResultReceived, threadId)
    const afterResult = await service.modules.authenticate.sendStepResult({
      threadId,
      result: { step: '2', outcome: 'failed', reason: CONSENT_DECLINED },
    })
    expect(afterResult.awaitingChoice).toBe(true)
    const onHolder = (await ended).payload.record as AuthenticateRecord
    expect(onHolder.findStep('2')?.result).toEqual({ step: '2', outcome: 'failed', reason: 'consent-declined' })
    expect(onHolder.awaitingChoice).toBe(true)
    expect(onHolder.declinedMethods).toEqual(['face'])
    expect(remainingCombinations(onHolder.request, onHolder.declinedMethods)).toEqual([['badge'], ['passport']])

    // no step until the new choice; the new choice holds no declined method
    await expect(
      service.modules.authenticate.sendStep({ threadId, step: { step: '3', method: 'passport', type: 'document' } })
    ).rejects.toThrow(/no step is sent until a new choice/)
    await expect(holder.modules.authenticate.choose({ threadId, combination: ['face', 'email'] })).rejects.toThrow(
      /holds face, whose consent the person declined/
    )

    const chosen = authState(service, AuthenticateState.ChoiceReceived, threadId)
    const chosenOnHolder = await holder.modules.authenticate.choose({ threadId, combination: ['passport'] })
    expect(chosenOnHolder.state).toBe(AuthenticateState.ChoiceSent)
    const record = (await chosen).payload.record as AuthenticateRecord
    expect(record.combination).toEqual(['passport'])
    expect(record.steps).toEqual([])
    expect(record.awaitingChoice).toBe(false)
    // both attempts stay on the record: the earlier one with its steps, the current one
    expect(
      record.earlierAttempts.map((attempt) => ({
        combination: attempt.combination,
        steps: attempt.steps.map((entry) => [entry.step, entry.method, entry.result?.outcome, entry.result?.reason]),
      }))
    ).toEqual([
      {
        combination: ['face', 'email'],
        steps: [
          ['1', 'email', 'passed', undefined],
          ['2', 'face', 'failed', 'consent-declined'],
        ],
      },
    ])

    // the new attempt runs its own steps, its ids its own
    const received = authState(holder, AuthenticateState.StepReceived, threadId)
    await service.modules.authenticate.sendStep({ threadId, step: { step: '1', method: 'passport', type: 'document' } })
    const onHolderNow = (await received).payload.record as AuthenticateRecord
    expect(onHolderNow.combination).toEqual(['passport'])
    expect(onHolderNow.steps.map((entry) => [entry.step, entry.method])).toEqual([['1', 'passport']])
    expect(onHolderNow.earlierAttempts).toHaveLength(1)
    const passed = authState(holder, AuthenticateState.StepResultReceived, threadId)
    await service.modules.authenticate.sendStepResult({ threadId, result: { step: '1', outcome: 'passed' } })
    expect((await passed).payload.record.findStep('1')?.result).toEqual({ step: '1', outcome: 'passed' })
    // a passed step awaits no choice: a third choice is refused before it leaves the phone
    await expect(holder.modules.authenticate.choose({ threadId, combination: ['badge'] })).rejects.toThrow(
      /waits for no choice/
    )

    const completed = flowState(holder, AyniFlowState.Completed, flow.flowId)
    await service.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
    await completed
  })

  it('fails malformed a new choice that holds the declined method (§6.14)', async () => {
    const { flow, threadId } = await upToTheConsent()
    const { onHolder } = await declineTheConsent(threadId)
    expect(onHolder.awaitingChoice).toBe(true)
    const failed = authState(service, AuthenticateState.Failed, threadId)
    await sendRaw(
      holder as Agent<any>,
      holderConnection,
      new AuthenticateChoiceMessage({ threadId, parentThreadId: flow.flowId, combination: ['face', 'email'] })
    )
    const record = (await failed).payload.record
    expect(record.errorCode).toBe('malformed')
    expect(record.errorDescription).toMatch(/holds face, whose consent the person declined/)
    await service.modules.ayniFlow.sendProblemReport({ flowId: flow.flowId, code: 'malformed' })
  })

  it('takes no second choice but after a declined consent: a repeat is ignored, another fails malformed', async () => {
    const { flow, threadId } = await openAuthenticate()
    const chosen = authState(service, AuthenticateState.ChoiceReceived, threadId)
    await holder.modules.authenticate.choose({ threadId, combination: ['badge'] })
    await chosen
    // the holder's own API refuses it
    await expect(holder.modules.authenticate.choose({ threadId, combination: ['passport'] })).rejects.toThrow(
      /waits for no choice/
    )
    const failed = authState(service, AuthenticateState.Failed, threadId)
    const raw = (combination: string[]) =>
      sendRaw(
        holder as Agent<any>,
        holderConnection,
        new AuthenticateChoiceMessage({ threadId, parentThreadId: flow.flowId, combination })
      )
    // the same choice delivered twice is ignored; another choice fails the exchange
    await raw(['badge'])
    await raw(['passport'])
    const record = (await failed).payload.record
    expect(record.errorCode).toBe('malformed')
    expect(record.errorDescription).toMatch(/choice \[passport\] comes while no choice is awaited/)
    expect(record.combination).toEqual(['badge'])
    await service.modules.ayniFlow.sendProblemReport({ flowId: flow.flowId, code: 'malformed' })
  })

  it('answers no step its carrier answers, and sends nothing in a flow that is closed (FLOW-CORE-005)', async () => {
    const { flow, threadId } = await openAuthenticate()
    const chosen = authState(service, AuthenticateState.ChoiceReceived, threadId)
    await holder.modules.authenticate.choose({ threadId, combination: ['badge'] })
    await chosen
    const received = authState(holder, AuthenticateState.StepReceived, threadId)
    await service.modules.authenticate.sendStep({ threadId, step: { step: '1', method: 'badge', type: 'credential' } })
    await received
    // a credential step is answered by its presentation, not by an answer
    await expect(holder.modules.authenticate.answer({ threadId, answer: { step: '1', code: '1' } })).rejects.toThrow(
      /waits for no answer/
    )

    const declined = flowState(service, AyniFlowState.Declined, flow.flowId)
    await holder.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'declined' })
    await declined
    const failure = service.modules.authenticate.sendStepResult({
      threadId,
      result: { step: '1', outcome: 'failed', reason: 'not-valid' },
    })
    await expect(failure).rejects.toBeInstanceOf(AyniFlowClosedError)
    await expect(failure).rejects.toMatchObject({ status: 409, flowId: flow.flowId })
  })

  it('enrols a passkey in an enrol flow the holder opens (§6.4)', async () => {
    const flow = await holder.modules.ayniFlow.openFlow({
      connectionId: holderConnection.id,
      kind: 'enrol',
      title: 'Add a passkey',
      origin: { channel: 'none' },
      expiresTime: inFifteenMinutes(),
    })
    // the service takes the kind from a holder
    await flowState(service, AyniFlowState.Pending, flow.flowId)

    const requested = enrolState(service, EnrolState.RequestReceived)
    const sent = await holder.modules.authenticate.enrol({
      connectionId: holderConnection.id,
      parentThreadId: flow.flowId,
      type: 'passkey',
    })
    const onService = (await requested).payload.record
    expect(onService).toMatchObject({ threadId: sent.threadId, enrolType: 'passkey', role: AuthenticateRole.Requester })
    expect(onService.flowId).toBe(flow.flowId)

    const publicKey = {
      rp: { id: 'app.dev.ayni.org' },
      user: { id: 'dXNlcg', name: 'Ana Ríos', displayName: 'Ana Ríos' },
      challenge: 'Y2hhbGxlbmdl',
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    }
    await expect(
      service.modules.authenticate.sendEnrolChallenge({
        threadId: sent.threadId,
        challenge: { type: 'authenticator-app', secret: 'JBSWY3DPEHPK3PXP' },
      })
    ).rejects.toThrow(/type of the request/)
    // a passkey's challenge carries no error and no tries_left
    await expect(
      service.modules.authenticate.sendEnrolChallenge({
        threadId: sent.threadId,
        challenge: { type: 'passkey', publicKey, error: 'wrong-code', triesLeft: 2 },
      })
    ).rejects.toThrow(/public_key only/)
    const challenged = enrolState(holder, EnrolState.ChallengeReceived, sent.threadId)
    await service.modules.authenticate.sendEnrolChallenge({
      threadId: sent.threadId,
      challenge: { type: 'passkey', publicKey },
    })
    expect((await challenged).payload.record.challenge).toEqual({ type: 'passkey', publicKey })

    const attestation = { id: 'cred-1', clientDataJson: 'e30', attestationObject: 'bzE' }
    const answered = enrolState(service, EnrolState.AnswerReceived, sent.threadId)
    await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { attestation } })
    expect((await answered).payload.record.answer).toEqual({ attestation })

    const completed = flowState(holder, AyniFlowState.Completed, flow.flowId)
    await service.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
    await completed
  })

  it('enrols an authenticator app: the secret reaches the holder once and stays out of both records, a wrong code gets a new challenge', async () => {
    const sent = await holder.modules.authenticate.enrol({
      connectionId: holderConnection.id,
      type: 'authenticator-app',
    })
    await enrolState(service, EnrolState.RequestReceived, sent.threadId)
    const challenge = {
      type: 'authenticator-app' as const,
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Acme:ana?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
      digits: 6,
      period: 30,
    }
    const challenged = enrolState(holder, EnrolState.ChallengeReceived, sent.threadId)
    const onServiceRecord = await service.modules.authenticate.sendEnrolChallenge({
      threadId: sent.threadId,
      challenge,
    })
    const event = (await challenged).payload
    expect(event.challenge).toEqual(challenge)
    expect(event.record.challenge).toEqual({ type: 'authenticator-app', digits: 6, period: 30 })
    expect(onServiceRecord.challenge).toEqual({ type: 'authenticator-app', digits: 6, period: 30 })
    expect(JSON.stringify(await holder.modules.authenticate.getEnrolByThreadId(sent.threadId))).not.toContain(
      challenge.secret
    )
    expect(JSON.stringify(await service.modules.authenticate.getEnrolByThreadId(sent.threadId))).not.toContain(
      challenge.secret
    )

    await expect(
      holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '12345' } })
    ).rejects.toThrow(/six digits/)
    const wrong = enrolState(service, EnrolState.AnswerReceived, sent.threadId)
    await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '000000' } })
    await wrong
    // sent again with the same secret, error wrong-code and the codes left, and in their place only (§6.4, D155)
    await expect(
      service.modules.authenticate.sendEnrolChallenge({ threadId: sent.threadId, challenge })
    ).rejects.toThrow(/carries error wrong-code and tries_left/)
    await expect(
      service.modules.authenticate.sendEnrolChallenge({
        threadId: sent.threadId,
        challenge: { ...challenge, error: 'wrong-code', triesLeft: 1 },
      })
    ).rejects.toThrow(/tries_left is 2/)
    const again = enrolState(holder, EnrolState.ChallengeReceived, sent.threadId)
    const secondOnService = await service.modules.authenticate.sendEnrolChallenge({
      threadId: sent.threadId,
      challenge: { ...challenge, error: 'wrong-code', triesLeft: 2 },
    })
    expect(secondOnService.challenge).toEqual({
      type: 'authenticator-app',
      digits: 6,
      period: 30,
      error: 'wrong-code',
      triesLeft: 2,
    })
    const second = (await again).payload
    expect(second.record.challenges).toBe(2)
    // the holder shows "That code was not right, 2 tries left", with the secret once more in the event
    expect(second.challenge).toEqual({ ...challenge, error: 'wrong-code', triesLeft: 2 })
    expect(second.record.challenge).toMatchObject({ error: 'wrong-code', triesLeft: 2 })

    // three codes in all: the third challenge is the last, a fourth is refused (§6.4)
    const wrongAgain = enrolState(service, EnrolState.AnswerReceived, sent.threadId)
    await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '111111' } })
    await wrongAgain
    const third = enrolState(holder, EnrolState.ChallengeReceived, sent.threadId)
    await service.modules.authenticate.sendEnrolChallenge({
      threadId: sent.threadId,
      challenge: { ...challenge, error: 'wrong-code', triesLeft: 1 },
    })
    const thirdEvent = (await third).payload
    expect(thirdEvent.record.challenges).toBe(3)
    expect(thirdEvent.record.challenge).toMatchObject({ error: 'wrong-code', triesLeft: 1 })
    const wrongThird = enrolState(service, EnrolState.AnswerReceived, sent.threadId)
    await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '222222' } })
    await wrongThird
    await expect(
      service.modules.authenticate.sendEnrolChallenge({
        threadId: sent.threadId,
        challenge: { ...challenge, error: 'wrong-code', triesLeft: 0 },
      })
    ).rejects.toThrow(/3 codes in all/)
    // a holder that receives a fourth fails the enrolment malformed
    const failed = enrolState(holder, EnrolState.Failed, sent.threadId)
    await sendRaw(
      service as Agent<any>,
      serviceConnection,
      new EnrolChallengeMessage({ ...challenge, threadId: sent.threadId, parentThreadId: sent.parentThreadId })
    )
    expect((await failed).payload.record).toMatchObject({ errorCode: 'malformed' })
  })

  it('fails malformed, on the holder, a challenge whose error and tries_left do not match its place (§6.4)', async () => {
    const challenge = {
      type: 'authenticator-app' as const,
      secret: 'JBSWY3DPEHPK3PXP',
      otpauthUri: 'otpauth://totp/Acme:ana?secret=JBSWY3DPEHPK3PXP&issuer=Acme',
      digits: 6,
      period: 30,
    }
    const enrolAndChallenge = async (first: typeof challenge & { error?: 'wrong-code'; triesLeft?: number }) => {
      const sent = await holder.modules.authenticate.enrol({
        connectionId: holderConnection.id,
        type: 'authenticator-app',
      })
      await enrolState(service, EnrolState.RequestReceived, sent.threadId)
      const outcome = Promise.race([
        enrolState(holder, EnrolState.ChallengeReceived, sent.threadId),
        enrolState(holder, EnrolState.Failed, sent.threadId),
      ])
      await sendRaw(
        service as Agent<any>,
        serviceConnection,
        new EnrolChallengeMessage({ ...first, threadId: sent.threadId, parentThreadId: sent.parentThreadId })
      )
      return { sent, record: (await outcome).payload.record }
    }

    // a first challenge that says a code was wrong
    const early = await enrolAndChallenge({ ...challenge, error: 'wrong-code', triesLeft: 2 })
    expect(early.record).toMatchObject({ state: EnrolState.Failed, errorCode: 'malformed' })
    expect(early.record.errorDescription).toMatch(/first challenge carries no error/)

    // a second challenge without error and tries_left, or with the wrong count
    for (const [second, why] of [
      [challenge, /carries error wrong-code and tries_left/],
      [{ ...challenge, error: 'wrong-code' as const, triesLeft: 3 }, /tries_left is 2/],
    ] as const) {
      const { sent, record } = await enrolAndChallenge(challenge)
      expect(record.state).toBe(EnrolState.ChallengeReceived)
      await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '000000' } })
      const failed = enrolState(holder, EnrolState.Failed, sent.threadId)
      await sendRaw(
        service as Agent<any>,
        serviceConnection,
        new EnrolChallengeMessage({ ...second, threadId: sent.threadId, parentThreadId: sent.parentThreadId })
      )
      const failedRecord = (await failed).payload.record
      expect(failedRecord).toMatchObject({ errorCode: 'malformed' })
      expect(failedRecord.errorDescription).toMatch(why)
    }
  })

  it('relays an unenrol outside any flow to the service, which alone takes it (§6.4, FLOW-SIGNIN-014)', async () => {
    const heard = waitForEvent<UnenrolReceivedEvent>(service, AuthenticateEventTypes.UnenrolReceived)
    const { messageId } = await holder.modules.authenticate.unenrol({
      connectionId: holderConnection.id,
      type: 'passkey',
    })
    expect((await heard).payload).toEqual({ connectionId: serviceConnection.id, messageId, type: 'passkey' })
    await expect(
      service.modules.authenticate.unenrol({ connectionId: serviceConnection.id, type: 'passkey' })
    ).rejects.toThrow(/not an authenticator/)
    await expect(
      holder.modules.authenticate.unenrol({ connectionId: holderConnection.id, type: 'email' as never })
    ).rejects.toThrow(/type must be one of/)
  })
})
