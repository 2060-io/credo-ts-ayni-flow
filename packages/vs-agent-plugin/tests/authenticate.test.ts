import 'reflect-metadata'

import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import { AuthenticateState, EnrolState } from '@ayni.org/credo-ts-didcomm-authenticate'
import { AyniFlowAlreadyOpenError, AyniFlowClosedError } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { ConsoleLogger, LogLevel } from '@credo-ts/core'
import type { ValidationPipe } from '@nestjs/common'
import { PIPES_METADATA } from '@nestjs/common/constants'
import { VsAgentEventTypes } from '@verana-labs/vs-agent-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AnswerStepBodyDto,
  AYNI_FLOW_EVENT,
  ayniFlowEvents,
  ChooseCombinationBodyDto,
  SendAuthenticateBodyDto,
  SendEnrolChallengeBodyDto,
  SendStepBodyDto,
  setupAyniFlowProtocols,
  V2DidcommAuthenticateController,
  V2DidcommAuthenticateEnrolController,
  V2DidcommAyniFlowController,
} from '../src'

/** The route's own pipe, as Nest runs it on the body before the controller. */
const validator =
  <T>(controller: object, metatype: new () => T) =>
  (body: Record<string, unknown>) => {
    const [pipe] = Reflect.getMetadata(PIPES_METADATA, controller) as ValidationPipe[]
    return pipe.transform(body, { type: 'body', metatype, data: '' }) as Promise<T>
  }

describe('authenticate/1.0 through the Admin API and webhook events (CC-VSA-005, CC-VSA-013)', () => {
  const network = new SubjectNetwork()
  type Modules = ReturnType<typeof setupAyniFlowProtocols>['modules']
  let service: TestAgent<Modules>
  let holder: TestAgent<Modules>
  let serviceConnectionId: string
  let holderConnectionId: string
  const webhook: { type: string; data: Record<string, unknown> }[] = []
  const events = (type: string) => webhook.filter((e) => e.type === type).map((e) => e.data)

  beforeAll(async () => {
    service = createTestAgent({
      name: 'service',
      network,
      modules: setupAyniFlowProtocols({ expiryCheckIntervalMs: 0 }).modules,
    })
    holder = createTestAgent({ name: 'holder', network, modules: setupAyniFlowProtocols({ side: 'holder' }).modules })
    await service.initialize()
    await holder.initialize()
    ayniFlowEvents(service as any, new ConsoleLogger(LogLevel.Off))
    service.events.on(VsAgentEventTypes.ModuleMessageReceived, ({ payload }: any) => {
      webhook.push(payload)
    })
    ;[{ id: serviceConnectionId }, { id: holderConnectionId }] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('opens an authenticate flow, sends the request and the steps, and relays the choice and the answers', async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    const authenticate = new V2DidcommAuthenticateController(service as any)
    const openBody = {
      connectionId: serviceConnectionId,
      kind: 'authenticate',
      title: 'Authenticate to Acme',
      origin: { channel: 'none' as const },
      expiresTime: new Date(Date.now() + 15 * 60_000).toISOString(),
    }
    const flow = await flows.open(openBody)
    // one authenticate flow at a time on a connection: VS Agent answers 409
    const second = flows.open(openBody)
    await expect(second).rejects.toBeInstanceOf(AyniFlowAlreadyOpenError)
    await expect(second).rejects.toMatchObject({ status: 409 })

    const validateRequest = validator(V2DidcommAuthenticateController, SendAuthenticateBodyDto)
    const body = {
      connectionId: serviceConnectionId,
      flowId: flow.flowId,
      request: {
        purpose: 'connection',
        methods: {
          badge: {
            type: 'credential',
            credential: { jsonSchemaCredentialId: 'https://ecs.example/vt/schemas-badge-jsc.json' },
            issuers: ['org:EE:12345678'],
          },
          email: { type: 'email' },
          face: { type: 'face-match' },
        },
        combinations: [['badge'], ['email', 'face']],
      },
    }
    await expect(validateRequest({ ...body, request: { ...body.request, purpose: 'login' } })).rejects.toThrow()
    await expect(
      authenticate.request(await validateRequest({ ...body, request: { ...body.request, combinations: [['face']] } }))
    ).rejects.toThrow(/no identifying method/)

    const received = waitForEvent(
      holder,
      'AuthenticateStateChanged' as any,
      (e: any) => e.payload.record.state === AuthenticateState.RequestReceived
    )
    const exchange = await authenticate.request(await validateRequest(body))
    expect(exchange).toMatchObject({ flowId: flow.flowId, state: 'request-sent', role: 'requester' })
    const { threadId } = exchange
    await received

    const chosen = waitForEvent(
      service,
      'AuthenticateStateChanged' as any,
      (e: any) => e.payload.record.state === AuthenticateState.ChoiceReceived
    )
    await holder.modules.authenticate.choose({ threadId, combination: ['face', 'email'] })
    await chosen
    expect(events(AYNI_FLOW_EVENT.authenticateStateChanged).at(-1)).toMatchObject({
      threadId,
      flowId: flow.flowId,
      state: 'choice-received',
      previousState: 'request-sent',
      combination: ['email', 'face'],
    })

    const validateStep = validator(V2DidcommAuthenticateController, SendStepBodyDto)
    const stepped = waitForEvent(
      holder,
      'AuthenticateStateChanged' as any,
      (e: any) => e.payload.record.state === AuthenticateState.StepReceived
    )
    const afterStep = await authenticate.step(
      threadId,
      await validateStep({ step: { step: '1', method: 'email', type: 'email', ask: 'address' } })
    )
    expect(afterStep.steps).toMatchObject([{ step: '1', method: 'email', awaitingAnswer: true }])
    await stepped
    await expect(validateStep({ step: { step: '1', method: 'email', type: 'email', ask: 'pin' } })).rejects.toThrow()

    const answered = waitForEvent(
      service,
      'AuthenticateStateChanged' as any,
      (e: any) => e.payload.record.state === AuthenticateState.AnswerReceived
    )
    await holder.modules.authenticate.answer({
      threadId,
      answer: { step: '1', address: 'ana@acme.example', locale: 'es-CO' },
    })
    await answered
    const answer = events(AYNI_FLOW_EVENT.authenticateStateChanged).at(-1) as any
    expect(answer.state).toBe('answer-received')
    expect(answer.steps[0].answer).toEqual({ step: '1', address: 'ana@acme.example', locale: 'es-CO' })

    const result = await authenticate.stepResult(threadId, {
      result: { step: '1', outcome: 'failed', reason: 'step-failed' },
    })
    expect(result.state).toBe('step-result-sent')
    expect((await authenticate.get(threadId)).steps).toMatchObject([
      { step: '1', result: { outcome: 'failed', reason: 'step-failed' } },
    ])
    expect((await authenticate.list(flow.flowId)).map((e) => e.threadId)).toEqual([threadId])

    // a step that did not pass ends the run: no other step follows it, and the service refuses on the flow
    await expect(
      authenticate.step(threadId, {
        step: { step: '2', method: 'face', type: 'face-match', ask: 'consent', text: 'May we film your face?' },
      })
    ).rejects.toThrow(/has not passed/)
    const failed = await flows.problemReport(flow.flowId, { code: 'step-failed', description: 'The code was wrong.' })
    expect(failed).toMatchObject({ state: 'failed', errorCode: 'step-failed' })
  })

  it('takes a declined consent through the routes, ends the step consent-declined and relays the new choice (§6.14)', async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    const authenticate = new V2DidcommAuthenticateController(service as any)
    // the holder's routes, as tests and tooling use them
    const onHolder = new V2DidcommAuthenticateController(holder as any)
    const validateChoice = validator(V2DidcommAuthenticateController, ChooseCombinationBodyDto)
    const validateAnswer = validator(V2DidcommAuthenticateController, AnswerStepBodyDto)
    const stateOn = (agent: TestAgent<Modules>, state: AuthenticateState, threadId?: string) =>
      waitForEvent(
        agent,
        'AuthenticateStateChanged' as any,
        (e: any) => e.payload.record.state === state && (!threadId || e.payload.record.threadId === threadId)
      )
    const flow = await flows.open({
      connectionId: serviceConnectionId,
      kind: 'authenticate',
      title: 'Authenticate to Acme',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    const received = stateOn(holder, AuthenticateState.RequestReceived)
    const { threadId } = await authenticate.request({
      connectionId: serviceConnectionId,
      flowId: flow.flowId,
      request: {
        purpose: 'connection',
        methods: { passport: { type: 'document' }, email: { type: 'email' }, face: { type: 'face-match' } },
        combinations: [['passport'], ['email', 'face']],
      },
    })
    await received
    let chosen = stateOn(service, AuthenticateState.ChoiceReceived, threadId)
    await onHolder.choose(threadId, await validateChoice({ combination: ['email', 'face'] }))
    await chosen
    let stepped = stateOn(holder, AuthenticateState.StepReceived, threadId)
    await authenticate.step(threadId, { step: { step: '1', method: 'email', type: 'email', ask: 'address' } })
    await stepped
    let answered = stateOn(service, AuthenticateState.AnswerReceived, threadId)
    await onHolder.answer(
      threadId,
      await validateAnswer({ answer: { step: '1', address: 'ana@acme.example', locale: 'es-CO' } })
    )
    await answered
    let ended = stateOn(holder, AuthenticateState.StepResultReceived, threadId)
    await authenticate.stepResult(threadId, { result: { step: '1', outcome: 'passed' } })
    await ended
    stepped = stateOn(holder, AuthenticateState.StepReceived, threadId)
    await authenticate.step(threadId, {
      step: { step: '2', method: 'face', type: 'face-match', ask: 'consent', text: 'May we film your face?' },
    })
    await stepped

    // the person declines the consent: the route takes false
    answered = stateOn(service, AuthenticateState.AnswerReceived, threadId)
    await onHolder.answer(threadId, await validateAnswer({ answer: { step: '2', consent: false } }))
    await answered
    expect(events(AYNI_FLOW_EVENT.authenticateStateChanged).at(-1)).toMatchObject({
      threadId,
      state: 'answer-received',
      awaitingChoice: false,
      steps: [{ step: '1' }, { step: '2', answer: { step: '2', consent: false } }],
    })
    ended = stateOn(holder, AuthenticateState.StepResultReceived, threadId)
    const afterResult = await authenticate.stepResult(threadId, {
      result: { step: '2', outcome: 'failed', reason: 'consent-declined' },
    })
    expect(afterResult).toMatchObject({ state: 'step-result-sent', awaitingChoice: true, declinedMethods: ['face'] })
    expect(events(AYNI_FLOW_EVENT.authenticateStateChanged).at(-1)).toMatchObject({
      state: 'step-result-sent',
      awaitingChoice: true,
      declinedMethods: ['face'],
    })
    expect(await ended).toMatchObject({ payload: { record: { state: 'step-result-received' } } })
    expect(await onHolder.get(threadId)).toMatchObject({ awaitingChoice: true, declinedMethods: ['face'] })

    // the new choice: the declined method refused, another combination relayed with the attempt before
    await expect(onHolder.choose(threadId, await validateChoice({ combination: ['email', 'face'] }))).rejects.toThrow(
      /whose consent the person declined/
    )
    chosen = stateOn(service, AuthenticateState.ChoiceReceived, threadId)
    await onHolder.choose(threadId, await validateChoice({ combination: ['passport'] }))
    await chosen
    const event = events(AYNI_FLOW_EVENT.authenticateStateChanged).at(-1) as any
    expect(event).toMatchObject({
      threadId,
      state: 'choice-received',
      previousState: 'step-result-sent',
      combination: ['passport'],
      steps: [],
      awaitingChoice: false,
      declinedMethods: ['face'],
    })
    expect(event.earlierAttempts).toMatchObject([
      {
        combination: ['email', 'face'],
        steps: [
          { step: '1', result: { outcome: 'passed' } },
          { step: '2', result: { outcome: 'failed', reason: 'consent-declined' } },
        ],
      },
    ])
    await flows.close(flow.flowId, { outcome: 'cancelled' })
  })

  it('answers 409 to a step sent in an authenticate flow the holder declined (FLOW-CORE-005)', async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    const authenticate = new V2DidcommAuthenticateController(service as any)
    const flow = await flows.open({
      connectionId: serviceConnectionId,
      kind: 'authenticate',
      title: 'Authenticate to Acme',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 15 * 60_000).toISOString(),
    })
    const received = waitForEvent(
      holder,
      'AuthenticateStateChanged' as any,
      (e: any) =>
        e.payload.record.state === AuthenticateState.RequestReceived && e.payload.record.flowId === flow.flowId
    )
    const { threadId } = await authenticate.request({
      connectionId: serviceConnectionId,
      flowId: flow.flowId,
      request: {
        purpose: 'visitor',
        methods: { email: { type: 'email' } },
        combinations: [['email']],
      },
    })
    await received
    const chosen = waitForEvent(
      service,
      'AuthenticateStateChanged' as any,
      (e: any) => e.payload.record.state === AuthenticateState.ChoiceReceived && e.payload.record.threadId === threadId
    )
    await holder.modules.authenticate.choose({ threadId, combination: ['email'] })
    await chosen
    const declined = waitForEvent(
      service,
      'AyniFlowStateChanged' as any,
      (e: any) => e.payload.flowRecord.flowId === flow.flowId && e.payload.flowRecord.state === 'declined'
    )
    await holder.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'declined' })
    await declined

    const step = authenticate.step(threadId, { step: { step: '1', method: 'email', type: 'email', ask: 'address' } })
    await expect(step).rejects.toBeInstanceOf(AyniFlowClosedError)
    await expect(step).rejects.toMatchObject({ status: 409, flowId: flow.flowId, state: 'declined' })
  })

  it("enrols an authenticator app from the holder's enrol flow, keeping the secret out of records and events", async () => {
    const enrolments = new V2DidcommAuthenticateEnrolController(service as any)
    const flow = await holder.modules.ayniFlow.openFlow({
      connectionId: holderConnectionId,
      kind: 'enrol',
      title: 'Add an authenticator app',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 15 * 60_000),
    })
    const requested = waitForEvent(
      service,
      'AuthenticateEnrolStateChanged' as any,
      (e: any) => e.payload.record.state === EnrolState.RequestReceived
    )
    const sent = await holder.modules.authenticate.enrol({
      connectionId: holderConnectionId,
      parentThreadId: flow.flowId,
      type: 'authenticator-app',
    })
    await requested
    expect(events(AYNI_FLOW_EVENT.enrolStateChanged).at(-1)).toMatchObject({
      threadId: sent.threadId,
      flowId: flow.flowId,
      type: 'authenticator-app',
      state: 'request-received',
      previousState: null,
    })

    const validateChallenge = validator(V2DidcommAuthenticateEnrolController, SendEnrolChallengeBodyDto)
    const secret = 'JBSWY3DPEHPK3PXP'
    const challenge = {
      type: 'authenticator-app',
      secret,
      otpauthUri: `otpauth://totp/Acme:ana?secret=${secret}&issuer=Acme`,
      digits: 6,
      period: 30,
    }
    await expect(validateChallenge({ challenge: { ...challenge, type: 'sms' } })).rejects.toThrow()
    const challenged = waitForEvent(
      holder,
      'AuthenticateEnrolStateChanged' as any,
      (e: any) => e.payload.record.state === EnrolState.ChallengeReceived
    )
    const afterChallenge = await enrolments.challenge(sent.threadId, await validateChallenge({ challenge }))
    expect(afterChallenge).toMatchObject({ state: 'challenge-sent', challenges: 1 })
    // the holder gets the secret once, in the event; no record, no route and no webhook keeps it
    expect(((await challenged) as any).payload.challenge).toEqual(challenge)
    expect(JSON.stringify(afterChallenge)).not.toContain(secret)
    expect(JSON.stringify(await enrolments.get(sent.threadId))).not.toContain(secret)
    expect(JSON.stringify(webhook)).not.toContain(secret)

    const answered = waitForEvent(
      service,
      'AuthenticateEnrolStateChanged' as any,
      (e: any) => e.payload.record.state === EnrolState.AnswerReceived
    )
    await holder.modules.authenticate.answerEnrol({ threadId: sent.threadId, answer: { code: '482913' } })
    await answered
    expect(events(AYNI_FLOW_EVENT.enrolStateChanged).at(-1)).toMatchObject({
      state: 'answer-received',
      answer: { code: '482913' },
    })
    expect((await enrolments.list(flow.flowId)).map((e) => e.threadId)).toEqual([sent.threadId])
    await service.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
  })

  it('relays an unenrol as a webhook event', async () => {
    const heard = waitForEvent(service, 'AuthenticateUnenrolReceived' as any)
    const { messageId } = await holder.modules.authenticate.unenrol({
      connectionId: holderConnectionId,
      type: 'passkey',
    })
    await heard
    expect(events(AYNI_FLOW_EVENT.unenrolReceived)).toEqual([
      { messageId, connectionId: serviceConnectionId, type: 'passkey' },
    ])
  })
})
