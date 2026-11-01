import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import type { ReissueRequest } from '../fields'
import { ReissueRequestMessage } from '../messages'
import { ReissueRecord, ReissueRepository } from '../repository'
import { ReissueEventTypes, ReissueRole, ReissueState, type ReissueStateChangedEvent } from '../types'
import { validateRequest } from '../validation'

export interface CreateReissueRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
  request: ReissueRequest
}

/** State machine of one `https://didcomm.org/reissue/1.0` exchange; builds the wire messages, never sends them (sending is `ReissueApi`). */
@injectable()
export class ReissueService {
  public constructor(
    private readonly repository: ReissueRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  /** Builds a `request` after checking it against the profile and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateReissueRequestOptions
  ): Promise<{ message: ReissueRequestMessage; record: ReissueRecord }> {
    const invalid = validateRequest(options.request)
    if (invalid) throw new CredoError(`reissue: invalid request: ${invalid}`)

    const message = new ReissueRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new ReissueRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: ReissueRole.Requester,
      state: ReissueState.RequestSent,
      request: options.request,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<ReissueRequestMessage>
  ): Promise<ReissueRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`reissue: ignoring replayed request '${message.id}'`)
      return null
    }

    const request = message.toRequest()
    const invalid = validateRequest(request)
    const record = new ReissueRecord({
      threadId: message.id,
      parentThreadId: message.thread?.parentThreadId,
      connectionId: connection.id,
      role: ReissueRole.Issuer,
      state: invalid ? ReissueState.Failed : ReissueState.RequestReceived,
      request,
      ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
    })
    if (invalid) this.logger.warn(`reissue: request '${message.id}' is malformed: ${invalid}`)
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return record
  }

  /** Records that the request was answered, by an `issue` flow or by a problem report (profile §6.11). */
  public async markAnswered(agentContext: AgentContext, record: ReissueRecord): Promise<ReissueRecord> {
    record.assertState([ReissueState.RequestSent, ReissueState.RequestReceived])
    await this.updateState(agentContext, record, ReissueState.Answered)
    return record
  }

  /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
  public async fail(
    agentContext: AgentContext,
    record: ReissueRecord,
    code: string,
    description?: string
  ): Promise<ReissueRecord> {
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, ReissueState.Failed)
    return record
  }

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<ReissueRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`reissue: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<ReissueRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  private async updateState(agentContext: AgentContext, record: ReissueRecord, state: ReissueState): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(agentContext: AgentContext, record: ReissueRecord, previousState: ReissueState | null) {
    this.eventEmitter.emit<ReissueStateChangedEvent>(agentContext, {
      type: ReissueEventTypes.ReissueStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }
}
