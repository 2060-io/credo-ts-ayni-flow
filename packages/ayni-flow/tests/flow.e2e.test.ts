import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  sleep,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import type { Agent } from '@credo-ts/core'
import type { DidCommConnectionRecord } from '@credo-ts/didcomm'
import { DidCommBasicMessage, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AyniFlowErrorCode,
  AyniFlowEventTypes,
  AyniFlowKind,
  AyniFlowModule,
  AyniFlowRole,
  AyniFlowState,
  type AyniFlowStateChangedEvent,
} from '../src'

const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000)
const origin = {
  channel: 'ag-ui' as const,
  agentDid: 'did:webvh:acme',
  sessionId: 's_1',
  conversationId: 'c_1',
  client: { description: 'Firefox on Linux', platform: 'web' as const },
}

const modulesFor = (role: AyniFlowRole, maxPendingFlows?: number) => ({
  ayniFlow: new AyniFlowModule({ role, maxPendingFlows }),
})

describe('ayni-flow/1.0 between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modulesFor>>
  let holder: TestAgent<ReturnType<typeof modulesFor>>
  let serviceConnection: DidCommConnectionRecord
  let holderConnection: DidCommConnectionRecord

  const stateChanged = (agent: Agent<any>, state: AyniFlowState, flowId?: string) =>
    waitForEvent<AyniFlowStateChangedEvent>(
      agent,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (event) => event.payload.flowRecord.state === state && (!flowId || event.payload.flowRecord.flowId === flowId)
    )

  beforeAll(async () => {
    service = createTestAgent({ name: 'service', network, modules: modulesFor(AyniFlowRole.Service) })
    holder = createTestAgent({ name: 'holder', network, modules: modulesFor(AyniFlowRole.Holder, 2) })
    await service.initialize()
    await holder.initialize()
    ;[serviceConnection, holderConnection] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('opens a flow on the service and records it pending on the holder, then closes it declined', async () => {
    const pendingOnHolder = stateChanged(holder, AyniFlowState.Pending)
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.Present,
      title: 'Prove you are an Acme employee',
      origin,
      expiresTime: inAnHour(),
    })
    expect(record.state).toBe(AyniFlowState.Pending)
    expect(record.openedByMe).toBe(true)

    const { payload } = await pendingOnHolder
    const holderRecord = payload.flowRecord
    expect(payload.previousState).toBeNull()
    expect(holderRecord.flowId).toBe(record.flowId)
    expect(holderRecord.connectionId).toBe(holderConnection.id)
    expect(holderRecord.openedByMe).toBe(false)
    expect(holderRecord.kind).toBe('present')
    expect(holderRecord.origin).toEqual(origin)
    expect(holderRecord.role).toBe(AyniFlowRole.Holder)

    const declinedOnService = stateChanged(service, AyniFlowState.Declined, record.flowId)
    const closed = await holder.modules.ayniFlow.closeFlow({ flowId: record.flowId, outcome: 'declined' })
    expect(closed.state).toBe(AyniFlowState.Declined)
    expect(closed.closedBy).toBe('me')

    const serviceRecord = (await declinedOnService).payload.flowRecord
    expect(serviceRecord.state).toBe(AyniFlowState.Declined)
    expect(serviceRecord.closedBy).toBe('peer')
    expect(serviceRecord.closedAt).toBeInstanceOf(Date)
  })

  it('ignores a second close of a closed flow and keeps the first outcome', async () => {
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.Issue,
      title: 'Receive your badge',
      origin: { channel: 'none' },
      expiresTime: inAnHour(),
    })
    const completedOnHolder = stateChanged(holder, AyniFlowState.Completed, record.flowId)
    await service.modules.ayniFlow.closeFlow({
      flowId: record.flowId,
      outcome: 'completed',
      references: [{ type: 'credential', id: 'cred-1' }],
    })
    const holderRecord = (await completedOnHolder).payload.flowRecord
    expect(holderRecord.references).toEqual([{ type: 'credential', id: 'cred-1' }])

    // the service's record is closed, so a second close is refused locally
    await expect(service.modules.ayniFlow.closeFlow({ flowId: record.flowId, outcome: 'cancelled' })).rejects.toThrow(
      /already closed/
    )
    // and the holder ignores a close the service forges past its own record
    const holderOnly = await holder.modules.ayniFlow.getByFlowId(record.flowId)
    expect(holderOnly.state).toBe(AyniFlowState.Completed)
  })

  it('fails the flow on both ends when the holder sends a problem report', async () => {
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.SignTx,
      title: 'Confirm a payment',
      origin: { channel: 'none' },
      expiresTime: inAnHour(),
    })
    await stateChanged(holder, AyniFlowState.Pending, record.flowId)

    const failedOnService = stateChanged(service, AyniFlowState.Failed, record.flowId)
    await holder.modules.ayniFlow.sendProblemReport({
      flowId: record.flowId,
      code: AyniFlowErrorCode.SummaryMismatch,
      description: 'the summary does not match the transaction body',
    })

    const serviceRecord = (await failedOnService).payload.flowRecord
    expect(serviceRecord.errorCode).toBe('summary-mismatch')
    expect(serviceRecord.reason).toBe('the summary does not match the transaction body')
    expect(serviceRecord.closedBy).toBe('peer')
  })

  it('refuses an unsupported kind with a problem report and records the refusal', async () => {
    const failedOnService = stateChanged(service, AyniFlowState.Failed)
    const failedOnHolder = stateChanged(holder, AyniFlowState.Failed)
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.IdentifyUa,
      title: 'Identify',
      origin: { channel: 'none' },
      expiresTime: inAnHour(),
    })

    const holderRecord = (await failedOnHolder).payload.flowRecord
    expect(holderRecord.flowId).toBe(record.flowId)
    expect(holderRecord.errorCode).toBe('unsupported-kind')
    expect(holderRecord.closedBy).toBe('me')

    const serviceRecord = (await failedOnService).payload.flowRecord
    expect(serviceRecord.flowId).toBe(record.flowId)
    expect(serviceRecord.errorCode).toBe('unsupported-kind')
  })

  it('refuses an open beyond the pending limit with too-many-flows', async () => {
    const open = () =>
      service.modules.ayniFlow.openFlow({
        connectionId: serviceConnection.id,
        kind: AyniFlowKind.Authorize,
        title: 'Approve',
        origin: { channel: 'none' },
        expiresTime: inAnHour(),
      })
    const first = await open()
    await stateChanged(holder, AyniFlowState.Pending, first.flowId)
    const second = await open()
    await stateChanged(holder, AyniFlowState.Pending, second.flowId)

    const refused = stateChanged(service, AyniFlowState.Failed)
    const third = await open()
    const serviceRecord = (await refused).payload.flowRecord
    expect(serviceRecord.flowId).toBe(third.flowId)
    expect(serviceRecord.errorCode).toBe('too-many-flows')

    // make room again
    for (const flow of [first, second]) {
      const closed = stateChanged(service, AyniFlowState.Cancelled, flow.flowId)
      await holder.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'cancelled' })
      await closed
    }
  })

  it('refuses a malformed open (no origin) with a problem report and records nothing', async () => {
    const service$ = service as Agent<any>
    const { AyniFlowOpenMessage } = await import('../src')
    const message = new AyniFlowOpenMessage({
      kind: 'present',
      title: 'Prove',
      origin: { channel: 'none' },
      expiresTime: inAnHour(),
    })
    message.origin = undefined

    const sender = service$.dependencyManager.resolve(DidCommMessageSender)
    const outbound = await getOutboundDidCommMessageContext(service$.context, {
      message,
      connectionRecord: serviceConnection,
    })
    await sender.sendMessage(outbound)
    await sleep(500)

    expect(await holder.modules.ayniFlow.findByFlowId(message.id)).toBeNull()
    expect(await service.modules.ayniFlow.findByFlowId(message.id)).toBeNull()
  })

  it('activates a pending flow when a carrier message carries its pthid, and drops carrier messages of a closed flow', async () => {
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.Confirm,
      title: 'Confirm',
      origin: { channel: 'none' },
      expiresTime: inAnHour(),
    })
    await stateChanged(holder, AyniFlowState.Pending, record.flowId)

    const activeOnService = stateChanged(service, AyniFlowState.Active, record.flowId)
    const activeOnHolder = stateChanged(holder, AyniFlowState.Active, record.flowId)
    const carrier = new DidCommBasicMessage({ content: 'a carrier message standing in for confirm/request' })
    carrier.setThread({ threadId: carrier.id, parentThreadId: record.flowId })
    const service$ = service as Agent<any>
    const sender = service$.dependencyManager.resolve(DidCommMessageSender)
    await sender.sendMessage(
      await getOutboundDidCommMessageContext(service$.context, {
        message: carrier,
        connectionRecord: serviceConnection,
      })
    )
    await activeOnService
    await activeOnHolder

    const cancelled = stateChanged(holder, AyniFlowState.Cancelled, record.flowId)
    await service.modules.ayniFlow.closeFlow({ flowId: record.flowId, outcome: 'cancelled', reason: 'changed my mind' })
    expect((await cancelled).payload.flowRecord.reason).toBe('changed my mind')

    const late = new DidCommBasicMessage({ content: 'too late' })
    late.setThread({ threadId: late.id, parentThreadId: record.flowId })
    await sender.sendMessage(
      await getOutboundDidCommMessageContext(service$.context, { message: late, connectionRecord: serviceConnection })
    )
    await sleep(500)
    const messages = await holder.didcomm.basicMessages.findAllByQuery({ connectionId: holderConnection.id })
    expect(messages.map((m) => m.content)).toContain('a carrier message standing in for confirm/request')
    expect(messages.map((m) => m.content)).not.toContain('too late')
  })

  it('expires a flow locally on both ends once expires_time has passed', async () => {
    const record = await service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.Present,
      title: 'Quick',
      origin: { channel: 'none' },
      expiresTime: new Date(Date.now() + 700),
    })
    await stateChanged(holder, AyniFlowState.Pending, record.flowId)
    await sleep(800)

    const expiredOnService = await service.modules.ayniFlow.expireDueFlows()
    expect(expiredOnService.map((r) => r.flowId)).toContain(record.flowId)
    expect((await service.modules.ayniFlow.getByFlowId(record.flowId)).state).toBe(AyniFlowState.Expired)

    // the holder has not run its timer; the next message of the flow expires it on arrival and is dropped
    const expiredOnHolder = stateChanged(holder, AyniFlowState.Expired, record.flowId)
    const carrier = new DidCommBasicMessage({ content: 'after expiry' })
    carrier.setThread({ threadId: carrier.id, parentThreadId: record.flowId })
    const service$ = service as Agent<any>
    const sender = service$.dependencyManager.resolve(DidCommMessageSender)
    await sender.sendMessage(
      await getOutboundDidCommMessageContext(service$.context, {
        message: carrier,
        connectionRecord: serviceConnection,
      })
    )
    const holderRecord = (await expiredOnHolder).payload.flowRecord
    expect(holderRecord.closedBy).toBe('expiry')
    const messages = await holder.didcomm.basicMessages.findAllByQuery({ connectionId: holderConnection.id })
    expect(messages.map((m) => m.content)).not.toContain('after expiry')
  })

  it('refuses an open whose expires_time has already passed', async () => {
    await expect(
      service.modules.ayniFlow.openFlow({
        connectionId: serviceConnection.id,
        kind: AyniFlowKind.Present,
        title: 'Late',
        origin: { channel: 'none' },
        expiresTime: new Date(Date.now() - 1000),
      })
    ).rejects.toThrow(/future/)
  })
})
