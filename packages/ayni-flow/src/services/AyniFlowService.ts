import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import { AyniFlowModuleConfig } from '../AyniFlowModuleConfig'
import {
  AyniFlowCloseMessage,
  AyniFlowOpenMessage,
  AyniFlowProblemReportMessage,
  type AyniFlowProblemReportMessageOptions,
} from '../messages'
import { AYNI_FLOW_ORIGIN_CHANNELS, type AyniFlowOriginOptions, type AyniFlowReferenceOptions } from '../models'
import { AyniFlowRecord, AyniFlowRepository } from '../repository'
import {
  AyniFlowClosedBy,
  AyniFlowErrorCode,
  AyniFlowEventTypes,
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
  requires?: string[]
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

/** State machine of the flow envelope (profile §5.2); builds the wire messages and never sends them (sending is `AyniFlowApi`). */
@injectable()
export class AyniFlowService {
  public constructor(
    private readonly repository: AyniFlowRepository,
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

    const message = new AyniFlowOpenMessage({
      kind: options.kind,
      title: options.title,
      description: options.description,
      origin: options.origin,
      expiresTime: options.expiresTime,
      requires: options.requires,
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
      requires: options.requires,
      steps: options.steps,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)

    return { message, record }
  }

  // ---- receiver side ---------------------------------------------------------------------------

  /**
   * Receives an `open` (FLOW-CORE-002, FLOW-CORE-004, FLOW-CORE-008, FLOW-SEC-003). Returns the new record, or the
   * problem report that refuses the flow; a replayed `open` returns neither.
   */
  public async processOpen(
    messageContext: DidCommInboundMessageContext<AyniFlowOpenMessage>
  ): Promise<ProcessOpenResult> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`ayni-flow: ignoring replayed open '${message.id}'`)
      return {}
    }

    const malformed = this.findMalformed(message)
    if (malformed) {
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

    const refusal = await this.findRefusal(agentContext, connection, kind, expiresTime)
    const record = new AyniFlowRecord({
      threadId: message.id,
      connectionId: connection.id,
      role: this.config.role,
      openedByMe: false,
      state: refusal ? AyniFlowState.Failed : AyniFlowState.Pending,
      kind,
      title,
      description: message.description,
      origin: { ...origin },
      expiresTime,
      requires: message.requires,
      steps: message.steps?.map((step) => ({ id: step.id, kind: step.kind, title: step.title })),
      ...(refusal
        ? { errorCode: refusal.code, reason: refusal.description, closedAt: new Date(), closedBy: AyniFlowClosedBy.Me }
        : {}),
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)

    if (refusal) {
      this.logger.info(`ayni-flow: refusing open '${message.id}' (${kind}): ${refusal.code}`)
      return { record, problemReport: this.buildProblemReport(message.id, refusal) }
    }
    return { record }
  }

  /** Receives a `close`; the first close wins, later ones and closes of unknown flows are ignored (FLOW-CORE-005). */
  public async processClose(
    messageContext: DidCommInboundMessageContext<AyniFlowCloseMessage>
  ): Promise<AyniFlowRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const record = await this.repository.findByThreadId(agentContext, message.flowId)
    if (!record) {
      this.logger.debug(`ayni-flow: ignoring close of unknown flow '${message.flowId}'`)
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
  }

  /** Receives a report-problem 1.0 with `~thread.pthid`: the flow closes `failed` (FLOW-ERR-001). */
  public async processProblemReport(
    messageContext: DidCommInboundMessageContext<AyniFlowProblemReportMessage>
  ): Promise<AyniFlowRecord | null> {
    const { message, agentContext } = messageContext
    const flowId = message.flowId
    if (!flowId) {
      this.logger.debug(`ayni-flow: ignoring problem report '${message.id}' without ~thread.pthid`)
      return null
    }

    const record = await this.repository.findByThreadId(agentContext, flowId)
    if (!record) {
      this.logger.debug(`ayni-flow: ignoring problem report for unknown flow '${flowId}'`)
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
  }

  // ---- either side -----------------------------------------------------------------------------

  /** Builds a `close` and closes the flow locally. */
  public async createClose(
    agentContext: AgentContext,
    record: AyniFlowRecord,
    options: CreateCloseOptions
  ): Promise<AyniFlowCloseMessage> {
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
  }

  /** Builds a problem report for an open flow and closes it `failed` locally. */
  public async createProblemReport(
    agentContext: AgentContext,
    record: AyniFlowRecord,
    options: CreateProblemReportOptions
  ): Promise<AyniFlowProblemReportMessage> {
    record.assertOpen()

    const message = this.buildProblemReport(record.threadId, options)
    record.errorCode = options.code
    record.reason = options.description ?? options.code
    record.closedAt = new Date()
    record.closedBy = AyniFlowClosedBy.Me
    await this.updateState(agentContext, record, AyniFlowState.Failed)
    return message
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

  /** `pending` becomes `active` when the first carrier message is exchanged (profile §5.2). */
  public async markActive(agentContext: AgentContext, flowId: string): Promise<AyniFlowRecord | null> {
    const record = await this.repository.findByThreadId(agentContext, flowId)
    if (!record || record.state !== AyniFlowState.Pending) return record
    await this.updateState(agentContext, record, AyniFlowState.Active)
    return record
  }

  /** Closes the flow `expired` locally when its `expires_time` has passed; returns whether it did. */
  public async expireIfDue(agentContext: AgentContext, record: AyniFlowRecord, now = new Date()): Promise<boolean> {
    if (record.isClosed || !record.isExpiredAt(now)) return false
    record.closedAt = now
    record.closedBy = AyniFlowClosedBy.Expiry
    await this.updateState(agentContext, record, AyniFlowState.Expired)
    return true
  }

  /** Closes every open flow past its `expires_time` (FLOW-CORE-004); returns the flows it expired. */
  public async expireDueFlows(agentContext: AgentContext, now = new Date()): Promise<AyniFlowRecord[]> {
    const open = await this.repository.findOpen(agentContext)
    const expired: AyniFlowRecord[] = []
    for (const record of open) {
      if (await this.expireIfDue(agentContext, record, now)) expired.push(record)
    }
    return expired
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
