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
import { PeerStatusRole } from '@ayni.org/credo-ts-didcomm-peer-status'
import { ReissueRole } from '@ayni.org/credo-ts-didcomm-reissue'
import { ConsoleLogger, LogLevel } from '@credo-ts/core'
import type { ValidationPipe } from '@nestjs/common'
import { PIPES_METADATA } from '@nestjs/common/constants'
import { VsAgentEventTypes } from '@verana-labs/vs-agent-sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AYNI_FLOW_EVENT,
  AyniFlowPlugin,
  ayniFlowEvents,
  createVsAgentPlugin,
  FLOW_LINK_MAX_LENGTH,
  OpenFlowBodyDto,
  setupAyniFlowProtocols,
  V2DidcommAuthorizeController,
  V2DidcommAyniFlowController,
  V2DidcommPeerStatusController,
} from '../src'

describe('plugin shape', () => {
  it('builds a VS Agent plugin with the nine modules, ten controllers and the routing table', () => {
    const plugin = AyniFlowPlugin()
    expect(plugin.name).toBe('ayni-flow')
    expect(Object.keys(plugin.credoPlugin!.modules).sort()).toEqual([
      'authorize',
      'ayniFlow',
      'confirm',
      'linkSession',
      'notify',
      'peerStatus',
      'reissue',
      'sessionGrant',
      'signTx',
    ])
    expect(plugin.controllers).toHaveLength(10)
    expect(plugin.didcommModules?.map((m) => m.module)).toEqual([
      'ayni-flow',
      'authorize',
      'confirm',
      'link-session',
      'session-grant',
      'sign-tx',
      'notify',
      'reissue',
      'peer-status',
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
    // peer-status is symmetric between services: a service tells and is told, a holder is told
    expect(service.peerStatus.config.roles).toEqual([PeerStatusRole.Notifier, PeerStatusRole.Receiver])
    expect(holder.peerStatus.config.roles).toEqual([PeerStatusRole.Receiver])
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

  it("takes an open's link through the route's validation: on the record, the answer, the webhook and the holder (FLOW-CORE-011)", async () => {
    const flows = new V2DidcommAyniFlowController(service as any)
    // the pipe of the route itself, as Nest runs it on the body before the controller
    const [pipe] = Reflect.getMetadata(PIPES_METADATA, V2DidcommAyniFlowController) as ValidationPipe[]
    const validate = (body: Record<string, unknown>) =>
      pipe.transform(body, { type: 'body', metatype: OpenFlowBodyDto, data: '' }) as Promise<OpenFlowBodyDto>
    const link = `https://app.dev.ayni.org/app/service/did:webvh:acme/spaces/spc_1/notifications?approval=apr_1`
    const body = {
      connectionId: serviceConnectionId,
      kind: 'authorize',
      title: 'Ana asks to run Post on X',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 60_000).toISOString(),
      link,
    }
    const onHolder = waitForEvent(holder, 'AyniFlowStateChanged' as any, (e: any) => e.payload.flowRecord.link === link)
    const flow = await flows.open(await validate(body))
    expect(flow.link).toBe(link)
    expect((await flows.get(flow.flowId)).link).toBe(link)
    expect(((await onHolder) as any).payload.flowRecord).toMatchObject({ flowId: flow.flowId, link })
    const event = webhook.find((e) => e.type === AYNI_FLOW_EVENT.flowStateChanged && e.data.flowId === flow.flowId)
    expect(event?.data.link).toBe(link)
    await flows.close(flow.flowId, { outcome: 'cancelled' })
    // a link that is not a string, or longer than an app link may be, is refused before anything is sent
    await expect(validate({ ...body, link: 42 })).rejects.toThrow()
    await expect(
      validate({ ...body, link: `https://app.dev.ayni.org/app/${'a'.repeat(FLOW_LINK_MAX_LENGTH)}` })
    ).rejects.toThrow()
    // and so is a field the route does not declare, which is why a link needed one
    await expect(validate({ ...body, other: 'x' })).rejects.toThrow()
    await expect(validate({ ...body, link: undefined })).resolves.toMatchObject({ kind: 'authorize' })
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

  it('tells the holder where it stands, answers its query, and relays a query as a webhook event (CC-VSA-012)', async () => {
    const peerStatus = new V2DidcommPeerStatusController(service as any)
    const status = {
      authentication: {
        rule: 'required' as const,
        credential: { jsonSchemaCredentialId: 'https://ecs.example/vt/schemas-badge-jsc.json' },
      },
      identified: false,
      open: [],
    }
    await expect(peerStatus.get(serviceConnectionId)).rejects.toThrow(/no peer status/)

    const told = waitForEvent(holder, 'PeerStatusReceived' as any)
    const sent = await peerStatus.send({ connectionId: serviceConnectionId, status })
    expect(sent.id).toBeTruthy()
    expect(((await told) as any).payload.status).toEqual(status)
    expect(await peerStatus.get(serviceConnectionId)).toMatchObject({ connectionId: serviceConnectionId, sent: status })

    // the holder asks again: the module answers with the status it holds, and the controller hears of the query
    const asked = waitForEvent(service, 'PeerStatusQueryReceived' as any)
    const again = waitForEvent(holder, 'PeerStatusReceived' as any)
    const holderConnection = (await holder.didcomm.connections.getAll())[0]
    await holder.modules.peerStatus.query({ connectionId: holderConnection.id })
    await asked
    expect(((await again) as any).payload.status).toEqual(status)
    const query = webhook.find((e) => e.type === AYNI_FLOW_EVENT.peerStatusQueryReceived)
    expect(query?.data).toMatchObject({ connectionId: serviceConnectionId, answered: true })

    await expect(
      peerStatus.send({
        connectionId: serviceConnectionId,
        status: { ...status, open: ['ag-ui'], refusal: { code: 'untrusted' } },
      })
    ).rejects.toThrow(/empty with a refusal/)
  })

  it('says which organizations it accepts and how the credential is obtained, and relays a guest who asks to authenticate (CC-VSA-013)', async () => {
    const peerStatus = new V2DidcommPeerStatusController(service as any)
    const status = {
      authentication: {
        rule: 'optional' as const,
        credential: { jsonSchemaCredentialId: 'https://ecs.example/vt/schemas-badge-jsc.json' },
        issuers: ['org:EE:12345678'],
        obtain: { text: 'Ask the Acme front desk for your badge.', url: 'https://acme.example/badge' },
      },
      identified: false,
      open: ['ag-ui'],
    }
    const told = waitForEvent(holder, 'PeerStatusReceived' as any)
    await peerStatus.send({ connectionId: serviceConnectionId, status })
    expect(((await told) as any).payload.status).toEqual(status)

    const asked = waitForEvent(service, 'PeerStatusAuthenticateReceived' as any)
    const holderConnection = (await holder.didcomm.connections.getAll())[0]
    const { messageId } = await holder.modules.peerStatus.authenticate({ connectionId: holderConnection.id })
    await asked
    const event = webhook.find((e) => e.type === AYNI_FLOW_EVENT.peerStatusAuthenticateReceived)
    expect(event?.data).toEqual({ connectionId: serviceConnectionId, messageId })
  })
})

describe('peer-status between two services, as webhook events', () => {
  const network = new SubjectNetwork()
  type Modules = ReturnType<typeof setupAyniFlowProtocols>['modules']
  let one: TestAgent<Modules>
  let other: TestAgent<Modules>
  let oneConnectionId: string
  let otherConnectionId: string
  const webhook: { type: string; data: Record<string, unknown> }[] = []

  beforeAll(async () => {
    one = createTestAgent({
      name: 'one',
      network,
      modules: setupAyniFlowProtocols({ expiryCheckIntervalMs: 0 }).modules,
    })
    other = createTestAgent({
      name: 'other',
      network,
      modules: setupAyniFlowProtocols({ expiryCheckIntervalMs: 0 }).modules,
    })
    await one.initialize()
    await other.initialize()
    ayniFlowEvents(other as any, new ConsoleLogger(LogLevel.Off))
    other.events.on(VsAgentEventTypes.ModuleMessageReceived, ({ payload }: any) => {
      webhook.push(payload)
    })
    ;[{ id: oneConnectionId }, { id: otherConnectionId }] = await makeConnection(one, other)
  })

  afterAll(async () => {
    await other.shutdown()
    await one.shutdown()
  })

  it('delivers what the peer says of this agent as a status-received event', async () => {
    const status = { authentication: { rule: 'none' as const }, identified: true, open: ['a2a'] }
    const received = waitForEvent(other, 'PeerStatusReceived' as any)
    await new V2DidcommPeerStatusController(one as any).send({ connectionId: oneConnectionId, status })
    await received
    const event = webhook.find((e) => e.type === AYNI_FLOW_EVENT.peerStatusReceived)
    expect(event?.data).toMatchObject({ connectionId: otherConnectionId, status, previous: null })
    expect(await new V2DidcommPeerStatusController(other as any).get(otherConnectionId)).toMatchObject({
      received: status,
    })
  })
})
