import type { Query, QueryOptions } from '@credo-ts/core'
import { AgentContext, CredoError, injectable } from '@credo-ts/core'
import type { DidCommMessage } from '@credo-ts/didcomm'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import { AuthenticateModuleConfig } from './AuthenticateModuleConfig'
import type {
  AuthenticateAnswer,
  AuthenticateRequest,
  AuthenticateStep,
  AuthenticateStepResult,
  EnrolAnswer,
  EnrolChallenge,
  EnrollableMethodType,
} from './fields'
import { UnenrolMessage } from './messages'
import type { AuthenticateRecord, EnrolRecord } from './repository'
import { AuthenticateService } from './services'
import { validateEnrolRequest } from './validation'

export interface SendAuthenticateRequestOptions {
  connectionId: string
  /** The id of the `authenticate` flow, set as `~thread.pthid` on every message of the exchange (profile §6.14). */
  parentThreadId?: string
  request: AuthenticateRequest
}

export interface ChooseCombinationOptions {
  /** The `@id` of the request. */
  threadId: string
  /** The method names of the combination the person chose. */
  combination: string[]
}

export interface SendStepOptions {
  threadId: string
  step: AuthenticateStep
}

export interface AnswerStepOptions {
  threadId: string
  answer: AuthenticateAnswer
}

export interface SendStepResultOptions {
  threadId: string
  result: AuthenticateStepResult
}

export interface SendEnrolRequestOptions {
  connectionId: string
  /** The id of the `enrol` flow the holder opened (profile §6.4). */
  parentThreadId?: string
  type: EnrollableMethodType
}

export interface SendEnrolChallengeOptions {
  /** The `@id` of the enrol-request. */
  threadId: string
  challenge: EnrolChallenge
}

export interface AnswerEnrolOptions {
  threadId: string
  answer: EnrolAnswer
}

/**
 * `https://didcomm.org/authenticate/1.0` (Ayni Flow Profile 1.0 §6.14, §6.4). A service (`requester`) sends `request`,
 * `step`, `step-result` and `enrol-challenge`; a holder (`authenticator`) sends `choice`, `answer`, `enrol-request`,
 * `enrol-answer` and `unenrol`. The `credential`, `document` and `face-match` steps run their carriers (present-proof
 * 2.0, mrtd 1.0, calls 1.0) under the same flow id, through their own modules.
 */
@injectable()
export class AuthenticateApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly config: AuthenticateModuleConfig,
    private readonly service: AuthenticateService,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  // ---- authentication ---------------------------------------------------------------------------

  /** Sends a `request` (service); the record's `threadId` is the request id the rest of the exchange answers. */
  public async request(options: SendAuthenticateRequestOptions): Promise<AuthenticateRecord> {
    const connection = await this.connectionService.getById(this.agentContext, options.connectionId)
    connection.assertReady()
    const { message, record } = await this.service.createRequest(this.agentContext, {
      connection,
      parentThreadId: options.parentThreadId,
      request: options.request,
    })
    await this.send(connection.id, message, record)
    return record
  }

  /** Sends the `choice` of the combination the person chose (holder). */
  public async choose(options: ChooseCombinationOptions): Promise<AuthenticateRecord> {
    const { message, record } = await this.service.createChoice(this.agentContext, options.threadId, {
      combination: options.combination,
    })
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Sends a `step` (service): the next method of the combination chosen, or the current step again. */
  public async sendStep(options: SendStepOptions): Promise<AuthenticateRecord> {
    const { message, record } = await this.service.createStep(this.agentContext, options.threadId, options.step)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Sends the `answer` the person gave in the authentication sheet (holder); never without the person (FLOW-SIGNIN-009). */
  public async answer(options: AnswerStepOptions): Promise<AuthenticateRecord> {
    const { message, record } = await this.service.createAnswer(this.agentContext, options.threadId, options.answer)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Sends the `step-result` that ends the current step (service). */
  public async sendStepResult(options: SendStepResultOptions): Promise<AuthenticateRecord> {
    const { message, record } = await this.service.createStepResult(this.agentContext, options.threadId, options.result)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Records a failure decided by the host (the person declined, the flow was closed or refused...); nothing is sent. */
  public fail(threadId: string, code: string, description?: string): Promise<AuthenticateRecord> {
    return this.service.fail(this.agentContext, threadId, code, description)
  }

  public getByThreadId(threadId: string): Promise<AuthenticateRecord> {
    return this.service.getByThreadId(this.agentContext, threadId)
  }

  public findByThreadId(threadId: string): Promise<AuthenticateRecord | null> {
    return this.service.findByThreadId(this.agentContext, threadId)
  }

  public findById(id: string): Promise<AuthenticateRecord | null> {
    return this.service.findById(this.agentContext, id)
  }

  /** The authentications that ran inside one flow. */
  public findByFlowId(flowId: string): Promise<AuthenticateRecord[]> {
    return this.service.findByParentThreadId(this.agentContext, flowId)
  }

  public findAllByQuery(query: Query<AuthenticateRecord>, queryOptions?: QueryOptions): Promise<AuthenticateRecord[]> {
    return this.service.findAllByQuery(this.agentContext, query, queryOptions)
  }

  // ---- enrolment ----------------------------------------------------------------------------------

  /** Sends an `enrol-request` (holder), inside the `enrol` flow it opened. */
  public async enrol(options: SendEnrolRequestOptions): Promise<EnrolRecord> {
    const connection = await this.connectionService.getById(this.agentContext, options.connectionId)
    connection.assertReady()
    const { message, record } = await this.service.createEnrolRequest(this.agentContext, {
      connection,
      parentThreadId: options.parentThreadId,
      type: options.type,
    })
    await this.send(connection.id, message, record)
    return record
  }

  /** Sends an `enrol-challenge` (service): the first, or a new one after a wrong code. */
  public async sendEnrolChallenge(options: SendEnrolChallengeOptions): Promise<EnrolRecord> {
    const { message, record } = await this.service.createEnrolChallenge(
      this.agentContext,
      options.threadId,
      options.challenge
    )
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Sends the `enrol-answer` (holder). */
  public async answerEnrol(options: AnswerEnrolOptions): Promise<EnrolRecord> {
    const { message, record } = await this.service.createEnrolAnswer(
      this.agentContext,
      options.threadId,
      options.answer
    )
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Records a failure of an enrolment decided by the host; nothing is sent. */
  public failEnrol(threadId: string, code: string, description?: string): Promise<EnrolRecord> {
    return this.service.failEnrol(this.agentContext, threadId, code, description)
  }

  /** Sends `unenrol` (holder), outside any flow: the person removes an enrolled method. Returns the message id. */
  public async unenrol(options: { connectionId: string; type: EnrollableMethodType }): Promise<{ messageId: string }> {
    if (!this.config.isAuthenticator) throw new CredoError('authenticate: this agent is not an authenticator')
    const invalid = validateEnrolRequest({ type: options.type })
    if (invalid) throw new CredoError(`authenticate: invalid unenrol: ${invalid}`)
    const connectionRecord = await this.connectionService.getById(this.agentContext, options.connectionId)
    connectionRecord.assertReady()
    const message = new UnenrolMessage({ type: options.type })
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, { message, connectionRecord })
    await this.messageSender.sendMessage(outbound)
    return { messageId: message.id }
  }

  public getEnrolByThreadId(threadId: string): Promise<EnrolRecord> {
    return this.service.getEnrolByThreadId(this.agentContext, threadId)
  }

  public findEnrolByThreadId(threadId: string): Promise<EnrolRecord | null> {
    return this.service.findEnrolByThreadId(this.agentContext, threadId)
  }

  /** The enrolments that ran inside one `enrol` flow. */
  public findEnrolmentsByFlowId(flowId: string): Promise<EnrolRecord[]> {
    return this.service.findEnrolByParentThreadId(this.agentContext, flowId)
  }

  public findAllEnrolmentsByQuery(query: Query<EnrolRecord>, queryOptions?: QueryOptions): Promise<EnrolRecord[]> {
    return this.service.findAllEnrolByQuery(this.agentContext, query, queryOptions)
  }

  private async send(
    connectionId: string,
    message: DidCommMessage,
    associatedRecord: AuthenticateRecord | EnrolRecord
  ): Promise<void> {
    const connectionRecord = await this.connectionService.getById(this.agentContext, connectionId)
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, {
      message,
      connectionRecord,
      associatedRecord,
    })
    await this.messageSender.sendMessage(outbound)
  }
}
