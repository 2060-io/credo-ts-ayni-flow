import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import type { LinkSessionRequest, LinkSessionResponse } from '../fields'
import { LinkSessionRequestMessage, LinkSessionResponseMessage } from '../messages'
import { LinkSessionRecord, LinkSessionRepository } from '../repository'
import { LinkSessionEventTypes, LinkSessionRole, LinkSessionState, type LinkSessionStateChangedEvent } from '../types'
import { validateRequest, validateResponse } from '../validation'

export interface CreateLinkSessionRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
  request: LinkSessionRequest
}

/** State machine of one `https://didcomm.org/link-session/1.0` exchange; builds the wire messages, never sends them (sending is `LinkSessionApi`). */
@injectable()
export class LinkSessionService {
  public constructor(
    private readonly repository: LinkSessionRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  /** Builds a `request` after checking it against the profile and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateLinkSessionRequestOptions
  ): Promise<{ message: LinkSessionRequestMessage; record: LinkSessionRecord }> {
    const invalid = validateRequest(options.request)
    if (invalid) throw new CredoError(`link-session: invalid request: ${invalid}`)

    const message = new LinkSessionRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new LinkSessionRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: LinkSessionRole.Agent,
      state: LinkSessionState.RequestSent,
      request: options.request,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<LinkSessionRequestMessage>
  ): Promise<LinkSessionRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`link-session: ignoring replayed request '${message.id}'`)
      return null
    }

    const request = message.toRequest()
    const invalid = validateRequest(request)
    const record = new LinkSessionRecord({
      threadId: message.id,
      parentThreadId: message.thread?.parentThreadId,
      connectionId: connection.id,
      role: LinkSessionRole.Holder,
      state: invalid ? LinkSessionState.Failed : LinkSessionState.RequestReceived,
      request,
      ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
    })
    if (invalid) this.logger.warn(`link-session: request '${message.id}' is malformed: ${invalid}`)
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return record
  }

  /** Builds the `response` of a received request after checking it against the profile, and records it sent. */
  public async createResponse(
    agentContext: AgentContext,
    record: LinkSessionRecord,
    response: LinkSessionResponse
  ): Promise<{ message: LinkSessionResponseMessage; record: LinkSessionRecord }> {
    record.assertRole(LinkSessionRole.Holder)
    record.assertState(LinkSessionState.RequestReceived)

    const invalid = validateResponse(record.request, response)
    if (invalid) throw new CredoError(`link-session: invalid response: ${invalid}`)

    const message = new LinkSessionResponseMessage({
      ...response,
      threadId: record.threadId,
      parentThreadId: record.parentThreadId,
    })
    record.response = response
    await this.updateState(agentContext, record, LinkSessionState.ResponseSent)
    return { message, record }
  }

  /**
   * Receives the `response` of a request we sent. A response that breaks a rule of the profile (for example an
   * attestation `none` on an attested request) fails the exchange with `errorCode` `malformed`; the host sends the flow's
   * problem report.
   */
  public async processResponse(
    messageContext: DidCommInboundMessageContext<LinkSessionResponseMessage>
  ): Promise<LinkSessionRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const record = await this.repository.findByThreadId(agentContext, message.threadId)
    if (!record) {
      this.logger.debug(`link-session: ignoring response to unknown request '${message.threadId}'`)
      return null
    }
    if (record.connectionId !== connection.id) {
      this.logger.warn(`link-session: ignoring response to '${message.threadId}' from another connection`)
      return null
    }
    if (record.state !== LinkSessionState.RequestSent) {
      this.logger.debug(`link-session: ignoring response to '${message.threadId}' in state ${record.state}`)
      return null
    }

    const response = message.toResponse()
    record.response = response
    const invalid = validateResponse(record.request, response)
    if (invalid) {
      this.logger.warn(`link-session: response to '${message.threadId}' is malformed: ${invalid}`)
      record.errorCode = 'malformed'
      record.errorDescription = invalid
      await this.updateState(agentContext, record, LinkSessionState.Failed)
      return record
    }
    await this.updateState(agentContext, record, LinkSessionState.ResponseReceived)
    return record
  }

  /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
  public async fail(
    agentContext: AgentContext,
    record: LinkSessionRecord,
    code: string,
    description?: string
  ): Promise<LinkSessionRecord> {
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, LinkSessionState.Failed)
    return record
  }

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<LinkSessionRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`link-session: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<LinkSessionRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  private async updateState(
    agentContext: AgentContext,
    record: LinkSessionRecord,
    state: LinkSessionState
  ): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(
    agentContext: AgentContext,
    record: LinkSessionRecord,
    previousState: LinkSessionState | null
  ) {
    this.eventEmitter.emit<LinkSessionStateChangedEvent>(agentContext, {
      type: LinkSessionEventTypes.LinkSessionStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }
}
