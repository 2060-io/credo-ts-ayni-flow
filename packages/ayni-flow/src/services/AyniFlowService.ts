import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import { AyniFlowModuleConfig } from '../AyniFlowModuleConfig'
import { AyniFlowAlreadyOpenError } from '../errors'
import {
  AyniFlowCloseMessage,
  AyniFlowOpenMessage,
  AyniFlowProblemReportMessage,
  type AyniFlowProblemReportMessageOptions,
} from '../messages'
import { AYNI_FLOW_ORIGIN_CHANNELS, type AyniFlowOriginOptions, type AyniFlowReferenceOptions } from '../models'
import { AyniFlowEarlyEndRecord, AyniFlowEarlyEndRepository, AyniFlowRecord, AyniFlowRepository } from '../repository'
import {
  AyniFlowClosedBy,
  AyniFlowErrorCode,
  AyniFlowEventTypes,
  AyniFlowKind,
  type AyniFlowOutcome,
  AyniFlowState,
  type AyniFlowStateChangedEvent,
} from '../types'

export interface CreateOpenOptions {
  connection: DidCommConnectionRecord
  kind: string
  title: string
  description?: string
  origin: AyniFlowOriginOptions
  expiresTime: Date
  /** An app link to the place where the person reads more of the request (FLOW-CORE-011). */
  link?: string
  steps?: { id: string; kind: string; title: string }[]
}

export interface CreateCloseOptions {
  outcome: AyniFlowOutcome
  reason?: string
  references?: AyniFlowReferenceOptions[]
}

export interface CreateProblemReportOptions {
  code: AyniFlowErrorCode | string
  /** The English sentence of `description.en`; defaults to the code. */
  description?: string
  /** `~thread.thid`: the message the report is about; defaults to the flow id. */
  threadId?: string
}

export interface ProcessOpenResult {
  record?: AyniFlowRecord
  problemReport?: AyniFlowProblemReportMessage
}

/**
 * Kinds of which an opener keeps at most one open per connection: a service keeps at most one `authenticate` flow
 * pending on a connection (§6.14, FLOW-SIGNIN-001).
 */
export const ONE_OPEN_PER_CONNECTION: readonly string[] = [AyniFlowKind.Authenticate]

/** How long the end of a flow received before its `open` is kept when the `open` never comes (`expireDueFlows` drops it). */
export const AYNI_FLOW_EARLY_END_RETENTION_MS = 24 * 60 * 60 * 1000

/**
 * State machine of the flow envelope (profile §5.2); builds the wire messages and never sends them (sending is
 * `AyniFlowApi`). Credo processes the messages of one delivery concurrently, so every read-then-write of a flow runs
 * under that flow's lock, from a fresh read: a write never undoes a concurrent one, and a closed flow stays closed
 * (FLOW-CORE-005).
 */
@injectable()
export class AyniFlowService {
  /** The last operation queued on each flow, by agent context and flow id (`withFlowLock`). */
  private readonly flowLocks = new Map<string, Promise<void>>()

  public constructor(
    private readonly repository: AyniFlowRepository,
    private readonly earlyEnds: AyniFlowEarlyEndRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger,
    private readonly config: AyniFlowModuleConfig
  ) {}

  public getConfig(): AyniFlowModuleConfig {
    return this.config
  }

  // ---- opener side -----------------------------------------------------------------------------

  /** Builds an `open` and records the flow `pending`, opened by us. */
  public async createOpen(
    agentContext: AgentContext,
    options: CreateOpenOptions
  ): Promise<{ message: AyniFlowOpenMessage; record: AyniFlowRecord }> {
    if (options.expiresTime.getTime() <= Date.now()) {
      throw new CredoError('ayni-flow: expiresTime must be in the future')
    }
    this.assertOrigin(options.origin)
    if (ONE_OPEN_PER_CONNECTION.includes(options.kind)) {
      // under a lock of the connection and kind, so that two opens at once do not both pass the check
      return this.withFlowLock(agentContext, `connection:${options.connection.id}:${options.kind}`, async () => {
        await this.assertNoneOpen(agentContext, options.connection.id, options.kind)
        return this.recordOpen(agentContext, options)
      })
    }
    return this.recordOpen(agentContext, options)
  }

  private async recordOpen(
    agentContext: AgentContext,
    options: CreateOpenOptions
  ): Promise<{ message: AyniFlowOpenMessage; record: AyniFlowRecord }> {
    const message = new AyniFlowOpenMessage({
      kind: options.kind,
      title: options.title,
      description: options.description,
      origin: options.origin,
      expiresTime: options.expiresTime,
      link: options.link,
      steps: options.steps,
    })

    const record = new AyniFlowRecord({
      threadId: message.id,
      connectionId: options.connection.id,
      role: this.config.role,
      openedByMe: true,
      state: AyniFlowState.Pending,
      kind: options.kind,
      title: options.title,
      description: options.description,
      origin: options.origin,
      expiresTime: options.expiresTime,
      link: options.link,
      steps: options.steps,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)

    return { message, record }
  }

  // ---- receiver side ---------------------------------------------------------------------------

  /**
   * Receives an `open` (FLOW-CORE-002, FLOW-CORE-004, FLOW-CORE-008, FLOW-SEC-003). Returns the new record, or the
   * problem report that refuses the flow; a replayed `open` returns neither. When the flow's `close` or problem report
   * came first on the same connection, the flow is recorded closed as that end says, and nothing is answered
   * (FLOW-CORE-005).
   */
  public async processOpen(
    messageContext: DidCommInboundMessageContext<AyniFlowOpenMessage>
  ): Promise<ProcessOpenResult> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    return this.withFlowLock(agentContext, message.id, async () => {
      const existing = await this.repository.findByThreadId(agentContext, message.id)
      if (existing) {
        this.logger.debug(`ayni-flow: ignoring replayed open '${message.id}'`)
        return {}
      }
      const earlyEnd = await this.earlyEnds.findByFlow(agentContext, message.id, connection.id)

      const malformed = this.findMalformed(message)
      if (malformed) {
        if (earlyEnd) await this.earlyEnds.delete(agentContext, earlyEnd)
        this.logger.warn(`ayni-flow: refusing open '${message.id}': ${malformed}`)
        return {
          problemReport: this.buildProblemReport(message.id, {
            code: AyniFlowErrorCode.Malformed,
            description: malformed,
          }),
        }
      }
      // the checks above establish these
      const kind = message.kind as string
      const title = message.title as string
      const origin = message.origin as AyniFlowOriginOptions
      const expiresTime = message.expiresTime as Date

      const refusal = earlyEnd ? undefined : await this.findRefusal(agentContext, connection, kind, expiresTime)
      const record = new AyniFlowRecord({
        threadId: message.id,
        connectionId: connection.id,
        role: this.config.role,
        openedByMe: false,
        state: earlyEnd?.state ?? (refusal ? AyniFlowState.Failed : AyniFlowState.Pending),
        kind,
        title,
        description: message.description,
        origin: { ...origin },
        expiresTime,
        link: message.link,
        steps: message.steps?.map((step) => ({ id: step.id, kind: step.kind, title: step.title })),
        ...this.closingFields(earlyEnd, refusal),
      })
      await this.repository.save(agentContext, record)
      if (earlyEnd) await this.earlyEnds.delete(agentContext, earlyEnd)
      this.emitStateChanged(agentContext, record, null)

      if (earlyEnd) {
        this.logger.info(`ayni-flow: open '${message.id}' (${kind}) came after its end: recorded ${record.state}`)
        return { record }
      }
      if (refusal) {
        this.logger.info(`ayni-flow: refusing open '${message.id}' (${kind}): ${refusal.code}`)
        return { record, problemReport: this.buildProblemReport(message.id, refusal) }
      }
      return { record }
    })
  }

  /**
   * Receives a `close`; the first close wins and later ones are ignored. The close of a flow whose `open` has not been
   * recorded yet is kept, and the `open` records the flow closed (FLOW-CORE-005).
   */
  public async processClose(
    messageContext: DidCommInboundMessageContext<AyniFlowCloseMessage>
  ): Promise<AyniFlowRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    return this.withFlowLock(agentContext, message.flowId, async () => {
      const record = await this.repository.findByThreadId(agentContext, message.flowId)
      if (!record) {
        await this.keepEarlyEnd(agentContext, {
          threadId: message.flowId,
          connectionId: connection.id,
          state: message.outcome as unknown as AyniFlowState,
          reason: message.reason ?? undefined,
          references: message.references?.map((reference) => ({ type: reference.type, id: reference.id })),
        })
        return null
      }
      if (record.connectionId !== connection.id) {
        this.logger.warn(`ayni-flow: ignoring close of flow '${message.flowId}' from another connection`)
        return null
      }
      if (record.isClosed) {
        this.logger.debug(`ayni-flow: ignoring close of flow '${message.flowId}' already ${record.state}`)
        return null
      }

      record.reason = message.reason ?? undefined
      record.references = message.references?.map((reference) => ({ type: reference.type, id: reference.id }))
      record.closedAt = new Date()
      record.closedBy = AyniFlowClosedBy.Peer
      await this.updateState(agentContext, record, message.outcome as unknown as AyniFlowState)
      return record
    })
  }

  /**
   * Receives a report-problem 1.0 with `~thread.pthid`: the flow closes `failed` (FLOW-ERR-001). Like a `close`, one
   * received before the flow's `open` is kept, and the `open` records the flow `failed` (FLOW-CORE-005).
   */
  public async processProblemReport(
    messageContext: DidCommInboundMessageContext<AyniFlowProblemReportMessage>
  ): Promise<AyniFlowRecord | null> {
    const { message, agentContext } = messageContext
    const flowId = message.flowId
    if (!flowId) {
      this.logger.debug(`ayni-flow: ignoring problem report '${message.id}' without ~thread.pthid`)
      return null
    }

    return this.withFlowLock(agentContext, flowId, async () => {
      const record = await this.repository.findByThreadId(agentContext, flowId)
      if (!record) {
        if (!messageContext.connection) {
          this.logger.debug(`ayni-flow: ignoring problem report for unknown flow '${flowId}' without a connection`)
          return null
        }
        await this.keepEarlyEnd(agentContext, {
          threadId: flowId,
          connectionId: messageContext.connection.id,
          state: AyniFlowState.Failed,
          errorCode: message.description.code,
          reason: message.description.en,
        })
        return null
      }
      if (messageContext.connection && record.connectionId !== messageContext.connection.id) {
        this.logger.warn(`ayni-flow: ignoring problem report for flow '${flowId}' from another connection`)
        return null
      }
      if (record.isClosed) {
        this.logger.debug(`ayni-flow: ignoring problem report for flow '${flowId}' already ${record.state}`)
        return null
      }

      record.errorCode = message.description.code
      record.reason = message.description.en
      record.closedAt = new Date()
      record.closedBy = AyniFlowClosedBy.Peer
      await this.updateState(agentContext, record, AyniFlowState.Failed)
      return record
    })
  }

  // ---- either side -----------------------------------------------------------------------------

  /**
   * Builds a `close` and closes the flow locally; `record` is read again first, and a flow closed meanwhile throws
   * `AyniFlowClosedError`.
   */
  public async createClose(
    agentContext: AgentContext,
    record: AyniFlowRecord,
    options: CreateCloseOptions
  ): Promise<AyniFlowCloseMessage> {
    return this.withFlowLock(agentContext, record.threadId, async () => {
      await this.reload(agentContext, record)
      record.assertOpen()

      const message = new AyniFlowCloseMessage({
        flowId: record.threadId,
        outcome: options.outcome,
        reason: options.reason ?? null,
        references: options.references,
      })

      record.reason = options.reason
      record.references = options.references
      record.closedAt = new Date()
      record.closedBy = AyniFlowClosedBy.Me
      await this.updateState(agentContext, record, options.outcome as unknown as AyniFlowState)
      return message
    })
  }

  /**
   * Builds a problem report for an open flow and closes it `failed` locally; `record` is read again first, and a flow
   * closed meanwhile throws `AyniFlowClosedError`.
   */
  public async createProblemReport(
    agentContext: AgentContext,
    record: AyniFlowRecord,
    options: CreateProblemReportOptions
  ): Promise<AyniFlowProblemReportMessage> {
    return this.withFlowLock(agentContext, record.threadId, async () => {
      await this.reload(agentContext, record)
      record.assertOpen()

      const message = this.buildProblemReport(record.threadId, options)
      record.errorCode = options.code
      record.reason = options.description ?? options.code
      record.closedAt = new Date()
      record.closedBy = AyniFlowClosedBy.Me
      await this.updateState(agentContext, record, AyniFlowState.Failed)
      return message
    })
  }

  /** A problem report for a flow this agent holds no record of (for example a refused, unrecorded `open`). */
  public buildProblemReport(flowId: string, options: CreateProblemReportOptions): AyniFlowProblemReportMessage {
    const reportOptions: AyniFlowProblemReportMessageOptions = {
      flowId,
      threadId: options.threadId,
      description: { code: options.code, en: options.description ?? options.code },
    }
    return new AyniFlowProblemReportMessage(reportOptions)
  }

  /**
   * `pending` becomes `active` when the first carrier message is exchanged (profile §5.2). Read under the flow's lock: a
   * close processed at the same time is never overwritten, and a closed flow never becomes `active` (FLOW-CORE-005).
   */
  public async markActive(agentContext: AgentContext, flowId: string): Promise<AyniFlowRecord | null> {
    return this.withFlowLock(agentContext, flowId, async () => {
      const record = await this.repository.findByThreadId(agentContext, flowId)
      if (!record || record.state !== AyniFlowState.Pending) return record
      await this.updateState(agentContext, record, AyniFlowState.Active)
      return record
    })
  }

  /** Closes the flow `expired` locally when its `expires_time` has passed; returns whether it did. */
  public async expireIfDue(agentContext: AgentContext, record: AyniFlowRecord, now = new Date()): Promise<boolean> {
    return this.withFlowLock(agentContext, record.threadId, async () => {
      await this.reload(agentContext, record)
      return this.expireLocked(agentContext, record, now)
    })
  }

  /**
   * Closes every open flow past its `expires_time` (FLOW-CORE-004); returns the flows it expired. Also drops the ends
   * of flows whose `open` never came, after `AYNI_FLOW_EARLY_END_RETENTION_MS`.
   */
  public async expireDueFlows(agentContext: AgentContext, now = new Date()): Promise<AyniFlowRecord[]> {
    const open = await this.repository.findOpen(agentContext)
    const expired: AyniFlowRecord[] = []
    for (const record of open) {
      if (await this.expireIfDue(agentContext, record, now)) expired.push(record)
    }
    await this.dropStaleEarlyEnds(agentContext, now)
    return expired
  }

  /**
   * The state of a flow whose messages are no longer taken nor sent (profile §5.2), or null while it is open: the flow
   * is closed, or past its `expires_time` (it is closed `expired` here), or its end came on `connectionId` before its
   * `open`. The inbound middleware drops a message of such a flow and the module refuses to send one (FLOW-CORE-004,
   * FLOW-CORE-005).
   */
  public async findEndedState(
    agentContext: AgentContext,
    flowId: string,
    connectionId?: string
  ): Promise<AyniFlowState | null> {
    return this.withFlowLock(agentContext, flowId, async () => {
      const record = await this.repository.findByThreadId(agentContext, flowId)
      if (record) {
        await this.expireLocked(agentContext, record, new Date())
        return record.isClosed ? record.state : null
      }
      if (!connectionId) return null
      return (await this.earlyEnds.findByFlow(agentContext, flowId, connectionId))?.state ?? null
    })
  }

  // ---- queries ---------------------------------------------------------------------------------

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByFlowId(agentContext: AgentContext, flowId: string): Promise<AyniFlowRecord> {
    const record = await this.repository.findByThreadId(agentContext, flowId)
    if (!record) throw new CredoError(`ayni-flow: no flow '${flowId}'`)
    return record
  }

  public findByFlowId(agentContext: AgentContext, flowId: string) {
    return this.repository.findByThreadId(agentContext, flowId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<AyniFlowRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  public findOpen(agentContext: AgentContext, connectionId?: string) {
    return this.repository.findOpen(agentContext, connectionId)
  }

  // ---- internals -------------------------------------------------------------------------------

  /** Throws `AyniFlowAlreadyOpenError` when a flow of `kind` this agent opened is still open on the connection. */
  private async assertNoneOpen(agentContext: AgentContext, connectionId: string, kind: string): Promise<void> {
    const now = new Date()
    for (const open of await this.repository.findOpen(agentContext, connectionId)) {
      if (open.kind !== kind || !open.openedByMe) continue
      // a flow past its expires_time is closed here rather than counted
      if (await this.expireIfDue(agentContext, open, now)) continue
      throw new AyniFlowAlreadyOpenError(open.threadId, kind)
    }
  }

  private findMalformed(message: AyniFlowOpenMessage): string | undefined {
    if (!message.kind) return 'kind is missing'
    if (!message.title) return 'title is missing'
    if (!message.expiresTime || Number.isNaN(message.expiresTime.getTime())) return 'expires_time is missing or invalid'
    if (!message.origin) return 'origin is missing'
    try {
      this.assertOrigin(message.origin)
    } catch (error) {
      return (error as Error).message
    }
    return undefined
  }

  private assertOrigin(origin: AyniFlowOriginOptions): void {
    if (!AYNI_FLOW_ORIGIN_CHANNELS.includes(origin.channel)) {
      throw new CredoError(`origin.channel must be one of ${AYNI_FLOW_ORIGIN_CHANNELS.join(', ')}`)
    }
    if (origin.channel === 'ag-ui') {
      if (!origin.agentDid) throw new CredoError('origin.agentDid is required when channel is ag-ui')
      if (!origin.sessionId) throw new CredoError('origin.sessionId is required when channel is ag-ui')
      if (!origin.client?.description || !origin.client.platform) {
        throw new CredoError('origin.client with description and platform is required when channel is ag-ui')
      }
    }
  }

  private async findRefusal(
    agentContext: AgentContext,
    connection: DidCommConnectionRecord,
    kind: string,
    expiresTime: Date
  ): Promise<CreateProblemReportOptions | undefined> {
    if (expiresTime.getTime() <= Date.now()) {
      return { code: AyniFlowErrorCode.Expired, description: 'the flow expired before it was received' }
    }
    if (!this.config.supportedKinds.includes(kind)) {
      return { code: AyniFlowErrorCode.UnsupportedKind, description: `kind '${kind}' is not supported` }
    }
    if (this.config.maxPendingFlows > 0) {
      const pending = await this.repository.findPendingByConnectionId(agentContext, connection.id)
      if (pending.length >= this.config.maxPendingFlows) {
        return {
          code: AyniFlowErrorCode.TooManyFlows,
          description: `more than ${this.config.maxPendingFlows} flows pending on the connection`,
        }
      }
    }
    return undefined
  }

  /**
   * Runs `operation` once every earlier operation on the same flow has ended. Every read-then-write of a flow goes
   * through here, so that the messages of one delivery, which Credo processes concurrently, change a flow one at a time.
   * An operation never calls another locked method on its own flow.
   */
  private async withFlowLock<T>(agentContext: AgentContext, flowId: string, operation: () => Promise<T>): Promise<T> {
    const key = `${agentContext.contextCorrelationId}:${flowId}`
    const previous = this.flowLocks.get(key) ?? Promise.resolve()
    let release = () => {}
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    const tail = previous.then(() => done)
    this.flowLocks.set(key, tail)
    try {
      await previous
      return await operation()
    } finally {
      release()
      if (this.flowLocks.get(key) === tail) this.flowLocks.delete(key)
    }
  }

  /** Brings `record` up to date with the store, so that a write made from it never undoes a concurrent one. */
  private async reload(agentContext: AgentContext, record: AyniFlowRecord): Promise<void> {
    Object.assign(record, await this.repository.getById(agentContext, record.id))
  }

  private async expireLocked(agentContext: AgentContext, record: AyniFlowRecord, now: Date): Promise<boolean> {
    if (record.isClosed || !record.isExpiredAt(now)) return false
    record.closedAt = now
    record.closedBy = AyniFlowClosedBy.Expiry
    await this.updateState(agentContext, record, AyniFlowState.Expired)
    return true
  }

  /** Keeps the end of a flow whose `open` is not recorded yet; the first end wins, as the first close does. */
  private async keepEarlyEnd(
    agentContext: AgentContext,
    props: ConstructorParameters<typeof AyniFlowEarlyEndRecord>[0]
  ): Promise<void> {
    if (await this.earlyEnds.findByFlow(agentContext, props.threadId, props.connectionId)) {
      this.logger.debug(`ayni-flow: ignoring a second end of flow '${props.threadId}' before its open`)
      return
    }
    await this.earlyEnds.save(agentContext, new AyniFlowEarlyEndRecord(props))
    this.logger.debug(`ayni-flow: end of flow '${props.threadId}' (${props.state}) before its open: kept for the open`)
  }

  private async dropStaleEarlyEnds(agentContext: AgentContext, now: Date): Promise<void> {
    const before = now.getTime() - AYNI_FLOW_EARLY_END_RETENTION_MS
    for (const stale of await this.earlyEnds.getAll(agentContext)) {
      if (stale.createdAt.getTime() >= before) continue
      await this.withFlowLock(agentContext, stale.threadId, async () => {
        const kept = await this.earlyEnds.findById(agentContext, stale.id)
        if (kept) await this.earlyEnds.delete(agentContext, kept)
      })
    }
  }

  /** What a flow recorded closed on its `open` keeps of why: the end that came first, or our refusal. */
  private closingFields(earlyEnd: AyniFlowEarlyEndRecord | null, refusal: CreateProblemReportOptions | undefined) {
    if (earlyEnd) {
      return {
        reason: earlyEnd.reason,
        references: earlyEnd.references,
        errorCode: earlyEnd.errorCode,
        closedAt: earlyEnd.createdAt,
        closedBy: AyniFlowClosedBy.Peer,
      }
    }
    if (refusal) {
      return {
        errorCode: refusal.code,
        reason: refusal.description,
        closedAt: new Date(),
        closedBy: AyniFlowClosedBy.Me,
      }
    }
    return {}
  }

  private async updateState(agentContext: AgentContext, record: AyniFlowRecord, state: AyniFlowState): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(agentContext: AgentContext, record: AyniFlowRecord, previousState: AyniFlowState | null) {
    this.eventEmitter.emit<AyniFlowStateChangedEvent>(agentContext, {
      type: AyniFlowEventTypes.AyniFlowStateChanged,
      payload: { flowRecord: record.clone(), previousState },
    })
  }
}
