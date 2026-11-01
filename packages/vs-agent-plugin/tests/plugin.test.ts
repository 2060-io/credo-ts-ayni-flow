import 'reflect-metadata'

import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import { AuthorizeRole, AuthorizeState } from '@ayni.org/credo-ts-didcomm-authorize'
import { AyniFlowRole, AyniFlowState } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { ReissueRole } from '@ayni.org/credo-ts-didcomm-reissue'
import { ConsoleLogger, LogLevel } from '@credo-ts/core'
import { VsAgentEventTypes } from '@verana-labs/vs-agent-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AYNI_FLOW_EVENT,
  AyniFlowPlugin,
  ayniFlowEvents,
  createVsAgentPlugin,
  setupAyniFlowProtocols,
  V2DidcommAuthorizeController,
  V2DidcommAyniFlowController,
} from '../src'

describe('plugin shape', () => {
  it('builds a VS Agent plugin with the eight modules, nine controllers and the routing table', () => {
    const plugin = AyniFlowPlugin()
    expect(plugin.name).toBe('ayni-flow')
    expect(Object.keys(plugin.credoPlugin!.modules).sort()).toEqual([
      'authorize',
      'ayniFlow',
      'confirm',
      'linkSession',
      'notify',
      'reissue',
      'sessionGrant',
      'signTx',
    ])
    expect(plugin.controllers).toHaveLength(9)
    expect(plugin.didcommModules?.map((m) => m.module)).toEqual([
      'ayni-flow',
      'authorize',
      'confirm',
      'link-session',
      'session-grant',
      'sign-tx',
      'notify',
      'reissue',
    ])
  })

  it('discloses the service roles by default and the holder roles on the other side', () => {
    const service = setupAyniFlowProtocols().modules
    expect(service.ayniFlow.config.role).toBe(AyniFlowRole.Service)
    expect(service.authorize.config.roles).toEqual([AuthorizeRole.Requester])
    expect(service.reissue.config.roles).toEqual([ReissueRole.Issuer])
    const holder = setupAyniFlowProtocols({ side: 'holder' }).modules
    expect(holder.ayniFlow.config.role).toBe(AyniFlowRole.Holder)
    expect(holder.authorize.config.roles).toEqual([AuthorizeRole.Approver])
    expect(holder.reissue.config.roles).toEqual([ReissueRole.Requester])
  })

  it('reads its options from the environment and refuses bad values', () => {
    const plugin = createVsAgentPlugin({
      AYNI_FLOW_SIDE: 'service',
      AYNI_FLOW_SUPPORTED_KINDS: 'session-grant, reissue',
      AYNI_FLOW_MAX_PENDING: '4',
      AYNI_FLOW_EXPIRY_CHECK_MS: '0',
    })
    const ayniFlow = plugin.credoPlugin!.modules.ayniFlow as ReturnType<
      typeof setupAyniFlowProtocols
    >['modules']['ayniFlow']
    expect(ayniFlow.config.supportedKinds).toEqual(['session-grant', 'reissue'])
    expect(ayniFlow.config.maxPendingFlows).toBe(4)
    expect(ayniFlow.config.expiryCheckIntervalMs).toBe(0)
    expect(() => createVsAgentPlugin({ AYNI_FLOW_SIDE: 'wallet' })).toThrow(/service/)
    expect(() => createVsAgentPlugin({ AYNI_FLOW_MAX_PENDING: 'ten' })).toThrow(/integer/)
  })
})

describe('Admin API and webhook events, service to holder', () => {
  const network = new SubjectNetwork()
  type Modules = ReturnType<typeof setupAyniFlowProtocols>['modules']
  let service: TestAgent<Modules>
  let holder: TestAgent<Modules>
  let serviceConnectionId: string
  const webhook: { type: string; data: Record<string, unknown> }[] = []

  beforeAll(async () => {
    service = createTestAgent({
      name: 'service',
      network,
      modules: setupAyniFlowProtocols({ expiryCheckIntervalMs: 0 }).modules,
    })
    holder = createTestAgent({ name: 'holder', network, modules: setupAyniFlowProtocols({ side: 'holder' }).modules })
    await service.initialize()
    await holder.initialize()
    // what VS Agent does in registerEvents: our relay, then its webhook delivery of ModuleMessageReceived
    ayniFlowEvents(service as any, new ConsoleLogger(LogLevel.Off))
    service.events.on(VsAgentEventTypes.ModuleMessageReceived, ({ payload }: any) => {
      webhook.push(payload)
    })
    ;[{ id: serviceConnectionId }] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('opens a flow, sends an authorize request inside it and relays every state as a webhook event', async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    const authorize = new V2DidcommAuthorizeController(service as any)

    const pendingOnHolder = waitForEvent(holder, 'AyniFlowStateChanged' as any)
    const flow = await flows.open({
      connectionId: serviceConnectionId,
      kind: 'authorize',
      title: 'Ana asks for your approval',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(flow.state).toBe('pending')
    await pendingOnHolder

    const receivedOnHolder = waitForEvent(holder, 'AuthorizeStateChanged' as any)
    const exchange = await authorize.request({
      connectionId: serviceConnectionId,
      flowId: flow.flowId,
      request: {
        requester: { name: 'Ana Ruiz', role: 'Analyst' },
        purpose: { id: 'customer-support', label: 'Customer support' },
        justification: 'Ticket 4411 needs the customer address.',
        scope: ['tool:crm.readCustomer'],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        attested: true,
      },
    })
    expect(exchange.flowId).toBe(flow.flowId)
    expect(exchange.state).toBe(AuthorizeState.RequestSent)
    await receivedOnHolder

    const answered = waitForEvent(
      service,
      'AuthorizeStateChanged' as any,
      (e: any) => e.payload.record.state === AuthorizeState.ResponseReceived
    )
    await holder.modules.authorize.respond({
      threadId: exchange.threadId,
      response: { decision: 'approved', attestation: { method: 'biometric', at: new Date().toISOString() } },
    })
    await answered

    const closed = await flows.close(flow.flowId, { outcome: 'completed' })
    expect(closed.state).toBe(AyniFlowState.Completed)
    expect((await flows.get(flow.flowId)).state).toBe('completed')
    expect((await authorize.list(flow.flowId)).map((e) => e.threadId)).toEqual([exchange.threadId])

    const types = webhook.map((e) => e.type)
    expect(types.filter((t) => t === AYNI_FLOW_EVENT.flowStateChanged).length).toBeGreaterThanOrEqual(3) // pending, active, completed
    expect(types).toContain(AYNI_FLOW_EVENT.authorizeStateChanged)
    const flowEvents = webhook.filter((e) => e.type === AYNI_FLOW_EVENT.flowStateChanged).map((e) => e.data)
    expect(flowEvents.map((d) => d.state)).toEqual(expect.arrayContaining(['pending', 'active', 'completed']))
    expect(flowEvents[0]).toMatchObject({
      flowId: flow.flowId,
      kind: 'authorize',
      previousState: null,
      openedByMe: true,
    })
    const response = webhook.find(
      (e) => e.type === AYNI_FLOW_EVENT.authorizeStateChanged && e.data.state === 'response-received'
    )
    expect(response?.data).toMatchObject({
      threadId: exchange.threadId,
      flowId: flow.flowId,
      response: { decision: 'approved' },
    })
  })

  it("relays the holder's problem report as a failed flow with the code (CC-VSA-010)", async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    const flow = await flows.open({
      connectionId: serviceConnectionId,
      kind: 'sign-tx',
      title: 'Confirm a payment',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 60_000).toISOString(),
    })
    const failed = waitForEvent(
      service,
      'AyniFlowStateChanged' as any,
      (e: any) => e.payload.flowRecord.state === 'failed'
    )
    await waitForEvent(holder, 'AyniFlowStateChanged' as any, (e: any) => e.payload.flowRecord.flowId === flow.flowId)
    await holder.modules.ayniFlow.sendProblemReport({
      flowId: flow.flowId,
      code: 'summary-mismatch',
      description: 'mismatch',
    })
    await failed

    const event = webhook.find(
      (e) => e.type === AYNI_FLOW_EVENT.flowStateChanged && e.data.flowId === flow.flowId && e.data.state === 'failed'
    )
    expect(event?.data).toMatchObject({ errorCode: 'summary-mismatch', reason: 'mismatch', closedBy: 'peer' })
  })
})
