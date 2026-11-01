import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import type { SessionGrantRequest, SessionGrantResponse } from '../fields'
import { SessionGrantGrantMessage, SessionGrantRequestMessage } from '../messages'
import { SessionGrantRecord, SessionGrantRepository } from '../repository'
import {
  SessionGrantEventTypes,
  SessionGrantRole,
  SessionGrantState,
  type SessionGrantStateChangedEvent,
} from '../types'
import { validateRequest, validateResponse } from '../validation'

export interface CreateSessionGrantRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
  request: SessionGrantRequest
}

/** State machine of one `https://didcomm.org/session-grant/1.0` exchange; builds the wire messages, never sends them (sending is `SessionGrantApi`). */
@injectable()
export class SessionGrantService {
  public constructor(
    private readonly repository: SessionGrantRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  /** Builds a `request` after checking it against the profile and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateSessionGrantRequestOptions
  ): Promise<{ message: SessionGrantRequestMessage; record: SessionGrantRecord }> {
    const invalid = validateRequest(options.request)
    if (invalid) throw new CredoError(`session-grant: invalid request: ${invalid}`)

    const message = new SessionGrantRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new SessionGrantRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: SessionGrantRole.Requester,
      state: SessionGrantState.RequestSent,
      request: options.request,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<SessionGrantRequestMessage>
  ): Promise<SessionGrantRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`session-grant: ignoring replayed request '${message.id}'`)
      return null
    }

    const request = message.toRequest()
    const invalid = validateRequest(request)
    const record = new SessionGrantRecord({
      threadId: message.id,
      parentThreadId: message.thread?.parentThreadId,
      connectionId: connection.id,
      role: SessionGrantRole.Agent,
      state: invalid ? SessionGrantState.Failed : SessionGrantState.RequestReceived,
      request,
      ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
    })
    if (invalid) this.logger.warn(`session-grant: request '${message.id}' is malformed: ${invalid}`)
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return record
  }

  /** Builds the `grant` of a received request after checking it against the profile, and records it sent. */
  public async createResponse(
    agentContext: AgentContext,
    record: SessionGrantRecord,
    response: SessionGrantResponse
  ): Promise<{ message: SessionGrantGrantMessage; record: SessionGrantRecord }> {
    record.assertRole(SessionGrantRole.Agent)
    record.assertState(SessionGrantState.RequestReceived)

    const invalid = validateResponse(record.request, response)
    if (invalid) throw new CredoError(`session-grant: invalid response: ${invalid}`)

    const message = new SessionGrantGrantMessage({
      ...response,
      threadId: record.threadId,
      parentThreadId: record.parentThreadId,
    })
    record.response = response
    await this.updateState(agentContext, record, SessionGrantState.ResponseSent)
    return { message, record }
  }

  /**
   * Receives the `grant` of a request we sent. A response that breaks a rule of the profile (for example an
   * attestation `none` on an attested request) fails the exchange with `errorCode` `malformed`; the host sends the flow's
   * problem report.
   */
  public async processResponse(
    messageContext: DidCommInboundMessageContext<SessionGrantGrantMessage>
  ): Promise<SessionGrantRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const record = await this.repository.findByThreadId(agentContext, message.threadId)
    if (!record) {
      this.logger.debug(`session-grant: ignoring response to unknown request '${message.threadId}'`)
      return null
    }
    if (record.connectionId !== connection.id) {
      this.logger.warn(`session-grant: ignoring response to '${message.threadId}' from another connection`)
      return null
    }
    if (record.state !== SessionGrantState.RequestSent) {
      this.logger.debug(`session-grant: ignoring response to '${message.threadId}' in state ${record.state}`)
      return null
    }

    const response = message.toResponse()
    record.response = response
    const invalid = validateResponse(record.request, response)
    if (invalid) {
      this.logger.warn(`session-grant: response to '${message.threadId}' is malformed: ${invalid}`)
      record.errorCode = 'malformed'
      record.errorDescription = invalid
      await this.updateState(agentContext, record, SessionGrantState.Failed)
      return record
    }
    await this.updateState(agentContext, record, SessionGrantState.ResponseReceived)
    return record
  }

  /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
  public async fail(
    agentContext: AgentContext,
    record: SessionGrantRecord,
    code: string,
    description?: string
  ): Promise<SessionGrantRecord> {
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, SessionGrantState.Failed)
    return record
  }

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<SessionGrantRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`session-grant: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<SessionGrantRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  private async updateState(
    agentContext: AgentContext,
    record: SessionGrantRecord,
    state: SessionGrantState
  ): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(
    agentContext: AgentContext,
    record: SessionGrantRecord,
    previousState: SessionGrantState | null
  ) {
    this.eventEmitter.emit<SessionGrantStateChangedEvent>(agentContext, {
      type: SessionGrantEventTypes.SessionGrantStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }
}
