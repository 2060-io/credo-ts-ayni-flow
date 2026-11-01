import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import type { AuthorizeRequest, AuthorizeResponse } from '../fields'
import { AuthorizeRequestMessage, AuthorizeResponseMessage } from '../messages'
import { AuthorizeRecord, AuthorizeRepository } from '../repository'
import { AuthorizeEventTypes, AuthorizeRole, AuthorizeState, type AuthorizeStateChangedEvent } from '../types'
import { validateRequest, validateResponse } from '../validation'

export interface CreateAuthorizeRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
  request: AuthorizeRequest
}

/** State machine of one `https://didcomm.org/authorize/1.0` exchange; builds the wire messages, never sends them (sending is `AuthorizeApi`). */
@injectable()
export class AuthorizeService {
  public constructor(
    private readonly repository: AuthorizeRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  /** Builds a `request` after checking it against the profile and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateAuthorizeRequestOptions
  ): Promise<{ message: AuthorizeRequestMessage; record: AuthorizeRecord }> {
    const invalid = validateRequest(options.request)
    if (invalid) throw new CredoError(`authorize: invalid request: ${invalid}`)

    const message = new AuthorizeRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new AuthorizeRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: AuthorizeRole.Requester,
      state: AuthorizeState.RequestSent,
      request: options.request,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<AuthorizeRequestMessage>
  ): Promise<AuthorizeRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`authorize: ignoring replayed request '${message.id}'`)
      return null
    }

    const request = message.toRequest()
    const invalid = validateRequest(request)
    const record = new AuthorizeRecord({
      threadId: message.id,
      parentThreadId: message.thread?.parentThreadId,
      connectionId: connection.id,
      role: AuthorizeRole.Approver,
      state: invalid ? AuthorizeState.Failed : AuthorizeState.RequestReceived,
      request,
      ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
    })
    if (invalid) this.logger.warn(`authorize: request '${message.id}' is malformed: ${invalid}`)
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return record
  }

  /** Builds the `response` of a received request after checking it against the profile, and records it sent. */
  public async createResponse(
    agentContext: AgentContext,
    record: AuthorizeRecord,
    response: AuthorizeResponse
  ): Promise<{ message: AuthorizeResponseMessage; record: AuthorizeRecord }> {
    record.assertRole(AuthorizeRole.Approver)
    record.assertState(AuthorizeState.RequestReceived)

    const invalid = validateResponse(record.request, response)
    if (invalid) throw new CredoError(`authorize: invalid response: ${invalid}`)

    const message = new AuthorizeResponseMessage({
      ...response,
      threadId: record.threadId,
      parentThreadId: record.parentThreadId,
    })
    record.response = response
    await this.updateState(agentContext, record, AuthorizeState.ResponseSent)
    return { message, record }
  }

  /**
   * Receives the `response` of a request we sent. A response that breaks a rule of the profile (for example an
   * attestation `none` on an attested request) fails the exchange with `errorCode` `malformed`; the host sends the flow's
   * problem report.
   */
  public async processResponse(
    messageContext: DidCommInboundMessageContext<AuthorizeResponseMessage>
  ): Promise<AuthorizeRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const record = await this.repository.findByThreadId(agentContext, message.threadId)
    if (!record) {
      this.logger.debug(`authorize: ignoring response to unknown request '${message.threadId}'`)
      return null
    }
    if (record.connectionId !== connection.id) {
      this.logger.warn(`authorize: ignoring response to '${message.threadId}' from another connection`)
      return null
    }
    if (record.state !== AuthorizeState.RequestSent) {
      this.logger.debug(`authorize: ignoring response to '${message.threadId}' in state ${record.state}`)
      return null
    }

    const response = message.toResponse()
    record.response = response
    const invalid = validateResponse(record.request, response)
    if (invalid) {
      this.logger.warn(`authorize: response to '${message.threadId}' is malformed: ${invalid}`)
      record.errorCode = 'malformed'
      record.errorDescription = invalid
      await this.updateState(agentContext, record, AuthorizeState.Failed)
      return record
    }
    await this.updateState(agentContext, record, AuthorizeState.ResponseReceived)
    return record
  }

  /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
  public async fail(
    agentContext: AgentContext,
    record: AuthorizeRecord,
    code: string,
    description?: string
  ): Promise<AuthorizeRecord> {
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, AuthorizeState.Failed)
    return record
  }

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<AuthorizeRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`authorize: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<AuthorizeRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  private async updateState(agentContext: AgentContext, record: AuthorizeRecord, state: AuthorizeState): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(agentContext: AgentContext, record: AuthorizeRecord, previousState: AuthorizeState | null) {
    this.eventEmitter.emit<AuthorizeStateChangedEvent>(agentContext, {
      type: AuthorizeEventTypes.AuthorizeStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }
}
