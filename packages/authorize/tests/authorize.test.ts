import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@2060.io/credo-ts-ayni-test-utils'
import {
  AyniFlowEventTypes,
  AyniFlowModule,
  AyniFlowRole,
  AyniFlowState,
  type AyniFlowStateChangedEvent,
} from '@2060.io/credo-ts-didcomm-ayni-flow'
import type { Agent } from '@credo-ts/core'
import { JsonTransformer } from '@credo-ts/core'
import type { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AUTHORIZE_REQUEST_TYPE,
  AUTHORIZE_RESPONSE_TYPE,
  AuthorizeEventTypes,
  AuthorizeModule,
  AuthorizeRequestMessage,
  AuthorizeResponseMessage,
  AuthorizeRole,
  AuthorizeState,
  type AuthorizeStateChangedEvent,
} from '../src'

const request = {
  requester: { name: 'Ana Ruiz', role: 'Analyst', did: null },
  purpose: { id: 'customer-support', label: 'Customer support' },
  justification: 'Ticket 4411 needs the customer address.',
  scope: ['tool:crm.readCustomer'],
  expiresAt: '2026-10-24T18:00:00.000Z',
  attested: true,
}

describe('authorize/1.0 messages', () => {
  it('serialises request as the profile §6.5 example', () => {
    const message = new AuthorizeRequestMessage({ ...request, id: 'req-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': AUTHORIZE_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      requester: { name: 'Ana Ruiz', role: 'Analyst', did: null },
      purpose: { id: 'customer-support', label: 'Customer support' },
      justification: 'Ticket 4411 needs the customer address.',
      scope: ['tool:crm.readCustomer'],
      expires_at: '2026-10-24T18:00:00.000Z',
      attested: true,
    })
  })

  it('serialises response as the profile §6.5 example', () => {
    const message = new AuthorizeResponseMessage({
      id: 'res-1',
      threadId: 'req-1',
      parentThreadId: 'f1ow-1',
      decision: 'approved',
      attestation: { method: 'biometric', at: '2026-10-24T15:21:03Z' },
    })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': AUTHORIZE_RESPONSE_TYPE,
      '@id': 'res-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      decision: 'approved',
      attestation: { method: 'biometric', at: '2026-10-24T15:21:03.000Z' },
      comment: null,
    })
  })

  it('rejects a response with an unknown decision at parse time', () => {
    expect(() =>
      JsonTransformer.fromJSON(
        {
          '@type': AUTHORIZE_RESPONSE_TYPE,
          '@id': 'r',
          '~thread': { thid: 'q' },
          decision: 'maybe',
          attestation: { method: 'none', at: '2026-10-24T15:21:03Z' },
        },
        AuthorizeResponseMessage
      )
    ).toThrow(/decision/)
  })
})

const modules = (flowRole: AyniFlowRole, roles: AuthorizeRole[]) => ({
  ayniFlow: new AyniFlowModule({ role: flowRole }),
  authorize: new AuthorizeModule({ roles }),
})

describe('authorize/1.0 inside an ayni-flow, between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let serviceConnection: DidCommConnectionRecord

  const authorizeState = (agent: Agent<any>, state: AuthorizeState, threadId?: string) =>
    waitForEvent<AuthorizeStateChangedEvent>(
      agent,
      AuthorizeEventTypes.AuthorizeStateChanged,
      (e) => e.payload.record.state === state && (!threadId || e.payload.record.threadId === threadId)
    )
  const flowState = (agent: Agent<any>, state: AyniFlowState, flowId: string) =>
    waitForEvent<AyniFlowStateChangedEvent>(
      agent,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (e) => e.payload.flowRecord.state === state && e.payload.flowRecord.flowId === flowId
    )

  beforeAll(async () => {
    service = createTestAgent({
      name: 'svc',
      network,
      modules: modules(AyniFlowRole.Service, [AuthorizeRole.Requester]),
    })
    holder = createTestAgent({ name: 'hld', network, modules: modules(AyniFlowRole.Holder, [AuthorizeRole.Approver]) })
    await service.initialize()
    await holder.initialize()
    ;[serviceConnection] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('runs an attested approval: the flow becomes active on the request and completes on the response', async () => {
    const flow = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: 'authorize',
      title: 'Ana asks for your approval',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 60_000),
    })
    await flowState(holder, AyniFlowState.Pending, flow.flowId)

    const receivedOnHolder = authorizeState(holder, AuthorizeState.RequestReceived)
    const activeOnService = flowState(service, AyniFlowState.Active, flow.flowId)
    const activeOnHolder = flowState(holder, AyniFlowState.Active, flow.flowId)
    const sent = await service.modules.authorize.request({
      connectionId: serviceConnection.id,
      parentThreadId: flow.flowId,
      request,
    })
    expect(sent.state).toBe(AuthorizeState.RequestSent)
    expect(sent.role).toBe(AuthorizeRole.Requester)

    const holderRecord = (await receivedOnHolder).payload.record
    expect(holderRecord.threadId).toBe(sent.threadId)
    expect(holderRecord.flowId).toBe(flow.flowId)
    expect(holderRecord.role).toBe(AuthorizeRole.Approver)
    expect(holderRecord.request).toEqual(request)
    await activeOnService
    await activeOnHolder

    // the holder cannot answer an attested request without authenticating the person
    await expect(
      holder.modules.authorize.respond({
        threadId: sent.threadId,
        response: { decision: 'approved', attestation: { method: 'none', at: new Date().toISOString() } },
      })
    ).rejects.toThrow(/none/)

    const responseOnService = authorizeState(service, AuthorizeState.ResponseReceived, sent.threadId)
    const at = new Date().toISOString()
    const answered = await holder.modules.authorize.respond({
      threadId: sent.threadId,
      response: { decision: 'approved', attestation: { method: 'biometric', at }, comment: 'ok' },
    })
    expect(answered.state).toBe(AuthorizeState.ResponseSent)

    const serviceRecord = (await responseOnService).payload.record
    expect(serviceRecord.response).toEqual({
      decision: 'approved',
      attestation: { method: 'biometric', at },
      comment: 'ok',
    })
    expect((await service.modules.authorize.findByFlowId(flow.flowId)).map((r) => r.threadId)).toEqual([sent.threadId])

    const completedOnHolder = flowState(holder, AyniFlowState.Completed, flow.flowId)
    await service.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
    await completedOnHolder
  })

  it('fails the exchange on the requester when a forged response breaks the attestation rule', async () => {
    const sent = await service.modules.authorize.request({ connectionId: serviceConnection.id, request })
    const received = (await authorizeState(holder, AuthorizeState.RequestReceived, sent.threadId)).payload.record

    // bypass the API's check to put a non-compliant response on the wire
    const { DidCommMessageSender, getOutboundDidCommMessageContext } = await import('@credo-ts/didcomm')
    const holder$ = holder as Agent<any>
    const holderConnection = await holder.didcomm.connections.getById(received.connectionId)
    const forged = new AuthorizeResponseMessage({
      threadId: sent.threadId,
      decision: 'approved',
      attestation: { method: 'none', at: new Date().toISOString() },
    })
    const failedOnService = authorizeState(service, AuthorizeState.Failed, sent.threadId)
    await holder$.dependencyManager
      .resolve(DidCommMessageSender)
      .sendMessage(
        await getOutboundDidCommMessageContext(holder$.context, { message: forged, connectionRecord: holderConnection })
      )

    const failed = (await failedOnService).payload.record
    expect(failed.errorCode).toBe('malformed')
    expect(failed.errorDescription).toMatch(/none/)
  })

  it('works without a flow and lets the host record a decline', async () => {
    const sent = await service.modules.authorize.request({
      connectionId: serviceConnection.id,
      request: { ...request, attested: false },
    })
    await authorizeState(holder, AuthorizeState.RequestReceived, sent.threadId)

    const rejected = authorizeState(service, AuthorizeState.ResponseReceived, sent.threadId)
    await holder.modules.authorize.respond({
      threadId: sent.threadId,
      response: { decision: 'rejected', attestation: { method: 'none', at: new Date().toISOString() } },
    })
    expect((await rejected).payload.record.response?.decision).toBe('rejected')

    const other = await service.modules.authorize.request({ connectionId: serviceConnection.id, request })
    await authorizeState(holder, AuthorizeState.RequestReceived, other.threadId)
    const failed = await holder.modules.authorize.fail(other.threadId, 'declined', 'the person declined')
    expect(failed.state).toBe(AuthorizeState.Failed)
    expect(failed.errorCode).toBe('declined')
  })
})
