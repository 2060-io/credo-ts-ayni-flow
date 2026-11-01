import type { AgentContext, Logger, Query, QueryOptions } from '@credo-ts/core'
import { CredoError, EventEmitter, InjectionSymbols, inject, injectable } from '@credo-ts/core'
import type { DidCommConnectionRecord, DidCommInboundMessageContext } from '@credo-ts/didcomm'

import type { SignTxRequest, SignTxResponse } from '../fields'
import { SignTxRequestMessage, SignTxResponseMessage } from '../messages'
import { SignTxRecord, SignTxRepository } from '../repository'
import { SignTxEventTypes, SignTxRole, SignTxState, type SignTxStateChangedEvent } from '../types'
import { validateRequest, validateResponse } from '../validation'

export interface CreateSignTxRequestOptions {
  connection: DidCommConnectionRecord
  /** The flow id when the exchange runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
  request: SignTxRequest
}

/** State machine of one `https://didcomm.org/sign-tx/1.0` exchange; builds the wire messages, never sends them (sending is `SignTxApi`). */
@injectable()
export class SignTxService {
  public constructor(
    private readonly repository: SignTxRepository,
    private readonly eventEmitter: EventEmitter,
    @inject(InjectionSymbols.Logger) private readonly logger: Logger
  ) {}

  /** Builds a `request` after checking it against the profile and records it sent. */
  public async createRequest(
    agentContext: AgentContext,
    options: CreateSignTxRequestOptions
  ): Promise<{ message: SignTxRequestMessage; record: SignTxRecord }> {
    const invalid = validateRequest(options.request)
    if (invalid) throw new CredoError(`sign-tx: invalid request: ${invalid}`)

    const message = new SignTxRequestMessage({ ...options.request, parentThreadId: options.parentThreadId })
    const record = new SignTxRecord({
      threadId: message.id,
      parentThreadId: options.parentThreadId,
      connectionId: options.connection.id,
      role: SignTxRole.Requester,
      state: SignTxState.RequestSent,
      request: options.request,
    })
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return { message, record }
  }

  /** Receives a `request`; a replay is ignored. A request that breaks a rule of the profile is recorded `failed` (`malformed`). */
  public async processRequest(
    messageContext: DidCommInboundMessageContext<SignTxRequestMessage>
  ): Promise<SignTxRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const existing = await this.repository.findByThreadId(agentContext, message.id)
    if (existing) {
      this.logger.debug(`sign-tx: ignoring replayed request '${message.id}'`)
      return null
    }

    const request = message.toRequest()
    const invalid = validateRequest(request)
    const record = new SignTxRecord({
      threadId: message.id,
      parentThreadId: message.thread?.parentThreadId,
      connectionId: connection.id,
      role: SignTxRole.Signer,
      state: invalid ? SignTxState.Failed : SignTxState.RequestReceived,
      request,
      ...(invalid ? { errorCode: 'malformed', errorDescription: invalid } : {}),
    })
    if (invalid) this.logger.warn(`sign-tx: request '${message.id}' is malformed: ${invalid}`)
    await this.repository.save(agentContext, record)
    this.emitStateChanged(agentContext, record, null)
    return record
  }

  /** Builds the `response` of a received request after checking it against the profile, and records it sent. */
  public async createResponse(
    agentContext: AgentContext,
    record: SignTxRecord,
    response: SignTxResponse
  ): Promise<{ message: SignTxResponseMessage; record: SignTxRecord }> {
    record.assertRole(SignTxRole.Signer)
    record.assertState(SignTxState.RequestReceived)

    const invalid = validateResponse(record.request, response)
    if (invalid) throw new CredoError(`sign-tx: invalid response: ${invalid}`)

    const message = new SignTxResponseMessage({
      ...response,
      threadId: record.threadId,
      parentThreadId: record.parentThreadId,
    })
    record.response = response
    await this.updateState(agentContext, record, SignTxState.ResponseSent)
    return { message, record }
  }

  /**
   * Receives the `response` of a request we sent. A response that breaks a rule of the profile (for example an
   * attestation `none` on an attested request) fails the exchange with `errorCode` `malformed`; the host sends the flow's
   * problem report.
   */
  public async processResponse(
    messageContext: DidCommInboundMessageContext<SignTxResponseMessage>
  ): Promise<SignTxRecord | null> {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    const record = await this.repository.findByThreadId(agentContext, message.threadId)
    if (!record) {
      this.logger.debug(`sign-tx: ignoring response to unknown request '${message.threadId}'`)
      return null
    }
    if (record.connectionId !== connection.id) {
      this.logger.warn(`sign-tx: ignoring response to '${message.threadId}' from another connection`)
      return null
    }
    if (record.state !== SignTxState.RequestSent) {
      this.logger.debug(`sign-tx: ignoring response to '${message.threadId}' in state ${record.state}`)
      return null
    }

    const response = message.toResponse()
    record.response = response
    const invalid = validateResponse(record.request, response)
    if (invalid) {
      this.logger.warn(`sign-tx: response to '${message.threadId}' is malformed: ${invalid}`)
      record.errorCode = 'malformed'
      record.errorDescription = invalid
      await this.updateState(agentContext, record, SignTxState.Failed)
      return record
    }
    await this.updateState(agentContext, record, SignTxState.ResponseReceived)
    return record
  }

  /** Records a failure decided by the host (for example the person declined, or the flow was refused). */
  public async fail(
    agentContext: AgentContext,
    record: SignTxRecord,
    code: string,
    description?: string
  ): Promise<SignTxRecord> {
    record.errorCode = code
    record.errorDescription = description
    await this.updateState(agentContext, record, SignTxState.Failed)
    return record
  }

  public getById(agentContext: AgentContext, id: string) {
    return this.repository.getById(agentContext, id)
  }

  public findById(agentContext: AgentContext, id: string) {
    return this.repository.findById(agentContext, id)
  }

  public async getByThreadId(agentContext: AgentContext, threadId: string): Promise<SignTxRecord> {
    const record = await this.repository.findByThreadId(agentContext, threadId)
    if (!record) throw new CredoError(`sign-tx: no exchange '${threadId}'`)
    return record
  }

  public findByThreadId(agentContext: AgentContext, threadId: string) {
    return this.repository.findByThreadId(agentContext, threadId)
  }

  public findByParentThreadId(agentContext: AgentContext, parentThreadId: string) {
    return this.repository.findByParentThreadId(agentContext, parentThreadId)
  }

  public findAllByQuery(agentContext: AgentContext, query: Query<SignTxRecord>, queryOptions?: QueryOptions) {
    return this.repository.findByQuery(agentContext, query, queryOptions)
  }

  private async updateState(agentContext: AgentContext, record: SignTxRecord, state: SignTxState): Promise<void> {
    const previousState = record.state
    record.state = state
    await this.repository.update(agentContext, record)
    this.emitStateChanged(agentContext, record, previousState)
  }

  private emitStateChanged(agentContext: AgentContext, record: SignTxRecord, previousState: SignTxState | null) {
    this.eventEmitter.emit<SignTxStateChangedEvent>(agentContext, {
      type: SignTxEventTypes.SignTxStateChanged,
      payload: { record: record.clone(), previousState },
    })
  }
}
