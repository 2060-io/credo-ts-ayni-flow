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
  type AuthenticateRequest,
  AuthenticateRole,
  AuthenticateState,
  type AuthenticateStateChangedEvent,
  EnrolState,
  type EnrolStateChangedEvent,
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
    // the holder answers the consent only with the person's agreement (FLOW-SIGNIN-012)
    await expect(
      holder.modules.authenticate.answer({ threadId, answer: { step: '2', consent: false } })
    ).rejects.toThrow(/consent is true/)
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
    const again = enrolState(holder, EnrolState.ChallengeReceived, sent.threadId)
    await service.modules.authenticate.sendEnrolChallenge({ threadId: sent.threadId, challenge })
    expect((await again).payload.record.challenges).toBe(2)
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
