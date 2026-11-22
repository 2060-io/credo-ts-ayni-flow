/**
 * Messages of one delivery processed together (profile §5.2, FLOW-CORE-005). Found on devnet, 2026-11-22: the phone was
 * away from its mediator while an agent sent an approval again ten times, closing the flow before each new one; the
 * messages reached the phone in one pickup, which Credo processes concurrently. A close taken before the open of its
 * flow was ignored as the close of an unknown flow, and a flow marked active from a record read before its close was
 * written open again after it.
 */
import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  sleep,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import type { Agent, AgentContext } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommMessage, DidCommMessageProcessedEvent } from '@credo-ts/didcomm'
import {
  DidCommBasicMessage,
  DidCommEventTypes,
  DidCommMessageSender,
  getOutboundDidCommMessageContext,
} from '@credo-ts/didcomm'
import { filter, firstValueFrom, take, timeout, toArray } from 'rxjs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AYNI_FLOW_EARLY_END_RETENTION_MS,
  AyniFlowClosedError,
  AyniFlowCloseMessage,
  AyniFlowEarlyEndRepository,
  AyniFlowEventTypes,
  AyniFlowKind,
  AyniFlowModule,
  AyniFlowProblemReportMessage,
  type AyniFlowRecord,
  AyniFlowRepository,
  AyniFlowRole,
  AyniFlowState,
  type AyniFlowStateChangedEvent,
} from '../src'

const inTenMinutes = () => new Date(Date.now() + 10 * 60_000)

// no pending limit on the holder: a test that fails must not make the next ones fail with too-many-flows
const modulesFor = (role: AyniFlowRole) => ({ ayniFlow: new AyniFlowModule({ role, maxPendingFlows: 0 }) })

describe('ayni-flow/1.0 when the messages of one delivery are processed together (FLOW-CORE-005)', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modulesFor>>
  let holder: TestAgent<ReturnType<typeof modulesFor>>
  let serviceConnection: DidCommConnectionRecord
  let holderConnection: DidCommConnectionRecord

  const flowChanged = (agent: Agent<any>, flowId: string) =>
    waitForEvent<AyniFlowStateChangedEvent>(
      agent,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (event) => event.payload.flowRecord.flowId === flowId
    )
  /** Every state the holder records for `flowId` from now on, as `previous -> state`. */
  const statesOnHolder = (flowId: string) => {
    const seen: string[] = []
    holder.events.on<AyniFlowStateChangedEvent>(AyniFlowEventTypes.AyniFlowStateChanged, ({ payload }) => {
      if (payload.flowRecord.flowId === flowId) seen.push(`${payload.previousState} -> ${payload.flowRecord.state}`)
    })
    return seen
  }
  const processedOnHolder = (accept: (message: DidCommMessage) => boolean) =>
    waitForEvent<DidCommMessageProcessedEvent>(holder, DidCommEventTypes.DidCommMessageProcessed, (event) =>
      accept(event.payload.message)
    )
  const isCloseOf = (flowId: string) => (message: DidCommMessage) =>
    message.type === AyniFlowCloseMessage.type.messageTypeUri && message.threadId === flowId
  const isReportOf = (flowId: string) => (message: DidCommMessage) =>
    message.type === AyniFlowProblemReportMessage.type.messageTypeUri && message.thread?.parentThreadId === flowId
  const isCarrierOf = (flowId: string) => (message: DidCommMessage) =>
    message.type === DidCommBasicMessage.type.messageTypeUri && message.thread?.parentThreadId === flowId

  const openFlow = () =>
    service.modules.ayniFlow.openFlow({
      connectionId: serviceConnection.id,
      kind: AyniFlowKind.Authorize,
      title: 'Ana Ríos asks to run Post on X',
      origin: { channel: 'none' },
      expiresTime: inTenMinutes(),
    })
  /** A basic message with the flow's `pthid`, standing in for the carrier's request or answer. */
  const sendCarrier = async (
    from: Agent<any>,
    connection: DidCommConnectionRecord,
    flowId: string,
    content: string
  ) => {
    const message = new DidCommBasicMessage({ content })
    message.setThread({ threadId: message.id, parentThreadId: flowId })
    const outbound = await getOutboundDidCommMessageContext(from.context, { message, connectionRecord: connection })
    await from.dependencyManager.resolve(DidCommMessageSender).sendMessage(outbound)
  }
  const flowOnHolder = (flowId: string) => holder.modules.ayniFlow.findByFlowId(flowId)
  const earlyEndOnHolder = (flowId: string) =>
    holder.dependencyManager.resolve(AyniFlowEarlyEndRepository).findByFlow(holder.context, flowId, holderConnection.id)
  const textsOnHolder = async () =>
    (await holder.didcomm.basicMessages.findAllByQuery({ connectionId: holderConnection.id })).map((m) => m.content)
  const textsOnService = async () =>
    (await service.didcomm.basicMessages.findAllByQuery({ connectionId: serviceConnection.id })).map((m) => m.content)

  beforeAll(async () => {
    service = createTestAgent({ name: 'service', network, modules: modulesFor(AyniFlowRole.Service) })
    holder = createTestAgent({ name: 'holder', network, modules: modulesFor(AyniFlowRole.Holder) })
    await service.initialize()
    await holder.initialize()
    ;[serviceConnection, holderConnection] = await makeConnection(service, holder)
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('a close taken before the open of its flow closes the flow when the open is recorded', async () => {
    let flowId = ''
    const held = await network.hold('holder', async () => {
      flowId = (await openFlow()).flowId
      await sendCarrier(service, serviceConnection, flowId, 'the request')
      await service.modules.ayniFlow.closeFlow({ flowId, outcome: 'cancelled', reason: 'The request was sent again.' })
    })
    expect(held).toHaveLength(3)
    const [open, carrier, close] = held
    const states = statesOnHolder(flowId)

    // the close is taken first: the holder knows no such flow yet, and keeps the close
    const closeProcessed = processedOnHolder(isCloseOf(flowId))
    network.deliver('holder', [close])
    await closeProcessed
    expect(await flowOnHolder(flowId)).toBeNull()

    // its open and carrier a moment after
    const recorded = flowChanged(holder, flowId)
    const carrierProcessed = processedOnHolder(isCarrierOf(flowId))
    network.deliver('holder', [open, carrier])
    const record = (await recorded).payload.flowRecord
    await carrierProcessed

    expect(record.state).toBe(AyniFlowState.Cancelled)
    expect(record.closedBy).toBe('peer')
    expect(record.reason).toBe('The request was sent again.')
    expect(record.closedAt).toBeInstanceOf(Date)
    expect((await flowOnHolder(flowId))?.state).toBe(AyniFlowState.Cancelled)
    expect((await holder.modules.ayniFlow.findOpen()).map((f) => f.flowId)).not.toContain(flowId)
    // never pending nor active on the holder, the carrier dropped, the kept close consumed
    expect(states).toEqual(['null -> cancelled'])
    expect(await textsOnHolder()).not.toContain('the request')
    expect(await earlyEndOnHolder(flowId)).toBeNull()

    // an answer in the flow is refused, and nothing reaches the service
    await expect(sendCarrier(holder, holderConnection, flowId, 'my answer')).rejects.toBeInstanceOf(AyniFlowClosedError)
    await sleep(200)
    expect(await textsOnService()).not.toContain('my answer')
  })

  it('a problem report taken before the open of its flow fails the flow when the open is recorded', async () => {
    let flowId = ''
    const held = await network.hold('holder', async () => {
      flowId = (await openFlow()).flowId
      await sendCarrier(service, serviceConnection, flowId, 'another request')
      await service.modules.ayniFlow.sendProblemReport({
        flowId,
        code: 'untrusted',
        description: 'The approver of this request changed.',
      })
    })
    expect(held).toHaveLength(3)
    const [open, carrier, report] = held

    const reportProcessed = processedOnHolder(isReportOf(flowId))
    network.deliver('holder', [report])
    await reportProcessed

    const recorded = flowChanged(holder, flowId)
    network.deliver('holder', [open, carrier])
    const record = (await recorded).payload.flowRecord
    expect(record.state).toBe(AyniFlowState.Failed)
    expect(record.errorCode).toBe('untrusted')
    expect(record.reason).toBe('The approver of this request changed.')
    expect(record.closedBy).toBe('peer')
    expect((await holder.modules.ayniFlow.findOpen()).map((f) => f.flowId)).not.toContain(flowId)
  })

  it('a flow marked active while its close is processed stays closed', async () => {
    const { flowId } = await openFlow()
    await waitForEvent<AyniFlowStateChangedEvent>(
      holder,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (event) => event.payload.flowRecord.flowId === flowId && event.payload.flowRecord.state === AyniFlowState.Pending
    )

    // the write of `active` on the holder is held, as when a write is slow while a delivery's messages are processed
    const repository = holder.dependencyManager.resolve(AyniFlowRepository)
    const update = repository.update.bind(repository)
    let release = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let reached = () => {}
    const activeReached = new Promise<void>((resolve) => {
      reached = resolve
    })
    let activeWritten: Promise<void> | undefined
    repository.update = (context: AgentContext, record: AyniFlowRecord) => {
      if (record.threadId !== flowId || record.state !== AyniFlowState.Active || activeWritten) {
        return update(context, record)
      }
      activeWritten = (async () => {
        reached()
        await gate
        await update(context, record)
      })()
      return activeWritten
    }
    try {
      // the carrier is processed: the module marks the flow active, and that write waits
      await sendCarrier(service, serviceConnection, flowId, 'the request, again')
      await activeReached

      // the flow's close is processed while the write of `active` is on its way
      const closeProcessed = processedOnHolder(isCloseOf(flowId))
      await service.modules.ayniFlow.closeFlow({ flowId, outcome: 'cancelled' })
      await Promise.race([closeProcessed, sleep(1000)])
      release()
      await activeWritten
      await closeProcessed

      const record = await flowOnHolder(flowId)
      expect(record?.state).toBe(AyniFlowState.Cancelled)
      expect(record?.closedBy).toBe('peer')
      expect((await holder.modules.ayniFlow.findOpen()).map((f) => f.flowId)).not.toContain(flowId)
      // and a closed flow is never marked active again
      expect((await holder.modules.ayniFlow.markActive(flowId))?.state).toBe(AyniFlowState.Cancelled)
    } finally {
      release()
      repository.update = update
    }
  })

  it('refuses an answer in a closed flow, and a second close, with AyniFlowClosedError', async () => {
    const { flowId } = await openFlow()
    const cancelled = waitForEvent<AyniFlowStateChangedEvent>(
      holder,
      AyniFlowEventTypes.AyniFlowStateChanged,
      (event) =>
        event.payload.flowRecord.flowId === flowId && event.payload.flowRecord.state === AyniFlowState.Cancelled
    )
    await service.modules.ayniFlow.closeFlow({ flowId, outcome: 'cancelled' })
    await cancelled

    const answer = sendCarrier(holder, holderConnection, flowId, 'approved')
    await expect(answer).rejects.toBeInstanceOf(AyniFlowClosedError)
    await expect(answer).rejects.toMatchObject({ flowId, state: AyniFlowState.Cancelled })
    await expect(answer).rejects.toThrow(/already closed \(cancelled\): https:\/\/didcomm.org\/basicmessage/)
    await expect(holder.modules.ayniFlow.closeFlow({ flowId, outcome: 'declined' })).rejects.toBeInstanceOf(
      AyniFlowClosedError
    )
    await sleep(200)
    expect(await textsOnService()).not.toContain('approved')
    expect((await service.modules.ayniFlow.getByFlowId(flowId)).state).toBe(AyniFlowState.Cancelled)
  })

  it('ten flows opened, sent and closed while the holder was away, delivered at once: every one ends closed', async () => {
    const flows: string[] = []
    const held = await network.hold('holder', async () => {
      for (let i = 0; i < 10; i++) {
        const { flowId } = await openFlow()
        flows.push(flowId)
        await sendCarrier(service, serviceConnection, flowId, `approval ${i}`)
        await service.modules.ayniFlow.closeFlow({
          flowId,
          outcome: 'cancelled',
          reason: 'The request was sent again.',
        })
      }
    })
    expect(held).toHaveLength(30)

    const ofTheseFlows = (message: DidCommMessage) =>
      flows.includes(message.threadId) || flows.includes(message.thread?.parentThreadId ?? '')
    const allProcessed = firstValueFrom(
      holder.events.observable<DidCommMessageProcessedEvent>(DidCommEventTypes.DidCommMessageProcessed).pipe(
        filter((event) => ofTheseFlows(event.payload.message)),
        take(30),
        toArray(),
        timeout(15_000)
      )
    )
    // one pickup, newest first: closes, carriers and opens taken together
    network.deliver('holder', [...held].reverse())
    await allProcessed

    for (const flowId of flows) {
      const record = await flowOnHolder(flowId)
      expect(record?.state, `flow ${flowId}`).toBe(AyniFlowState.Cancelled)
      expect(await earlyEndOnHolder(flowId)).toBeNull()
    }
    const open = (await holder.modules.ayniFlow.findOpen(holderConnection.id)).map((f) => f.flowId)
    expect(open.filter((flowId) => flows.includes(flowId))).toEqual([])
    // a carrier taken with its close may have been kept, as one taken just before it is; none can be answered
    for (const flowId of flows) {
      await expect(sendCarrier(holder, holderConnection, flowId, `answer to ${flowId}`)).rejects.toBeInstanceOf(
        AyniFlowClosedError
      )
    }
  })

  it('drops the kept close of a flow whose open never comes, once the retention has passed', async () => {
    let flowId = ''
    const held = await network.hold('holder', async () => {
      flowId = (await openFlow()).flowId
      await service.modules.ayniFlow.closeFlow({ flowId, outcome: 'cancelled' })
    })
    const [, close] = held
    const closeProcessed = processedOnHolder(isCloseOf(flowId))
    network.deliver('holder', [close])
    await closeProcessed
    expect((await earlyEndOnHolder(flowId))?.state).toBe(AyniFlowState.Cancelled)

    await holder.modules.ayniFlow.expireDueFlows()
    expect(await earlyEndOnHolder(flowId)).not.toBeNull()
    await holder.modules.ayniFlow.expireDueFlows(new Date(Date.now() + AYNI_FLOW_EARLY_END_RETENTION_MS + 60_000))
    expect(await earlyEndOnHolder(flowId)).toBeNull()
  })
})
