import type { Query, QueryOptions } from '@credo-ts/core'
import { AgentContext, injectable } from '@credo-ts/core'
import type { DidCommMessage } from '@credo-ts/didcomm'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import type { AuthorizeRequest, AuthorizeResponse } from './fields'
import type { AuthorizeRecord } from './repository'
import { AuthorizeService } from './services'

export interface SendAuthorizeRequestOptions {
  connectionId: string
  /** The flow id when the exchange runs inside an ayni-flow: set as `~thread.pthid` on every message (profile §2). */
  parentThreadId?: string
  request: AuthorizeRequest
}

export interface RespondAuthorizeOptions {
  /** The `@id` of the request being answered. */
  threadId: string
  response: AuthorizeResponse
}

/** `https://didcomm.org/authorize/1.0` (Ayni Flow Profile 1.0 §6.5). */
@injectable()
export class AuthorizeApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly service: AuthorizeService,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  /** Sends a `request`; the record's `threadId` is the request id the response answers. */
  public async request(options: SendAuthorizeRequestOptions): Promise<AuthorizeRecord> {
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

  /** Answers a received request with the `response` (profile §6.5); throws when the response breaks a rule of the profile. */
  public async respond(options: RespondAuthorizeOptions): Promise<AuthorizeRecord> {
    const record = await this.service.getByThreadId(this.agentContext, options.threadId)
    const { message } = await this.service.createResponse(this.agentContext, record, options.response)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Records a failure decided by the host (the person declined, the flow was refused...). */
  public async fail(threadId: string, code: string, description?: string): Promise<AuthorizeRecord> {
    const record = await this.service.getByThreadId(this.agentContext, threadId)
    return this.service.fail(this.agentContext, record, code, description)
  }

  public getById(id: string): Promise<AuthorizeRecord> {
    return this.service.getById(this.agentContext, id)
  }

  public findById(id: string): Promise<AuthorizeRecord | null> {
    return this.service.findById(this.agentContext, id)
  }

  public getByThreadId(threadId: string): Promise<AuthorizeRecord> {
    return this.service.getByThreadId(this.agentContext, threadId)
  }

  public findByThreadId(threadId: string): Promise<AuthorizeRecord | null> {
    return this.service.findByThreadId(this.agentContext, threadId)
  }

  /** The exchanges that ran inside one ayni-flow. */
  public findByFlowId(flowId: string): Promise<AuthorizeRecord[]> {
    return this.service.findByParentThreadId(this.agentContext, flowId)
  }

  public findAllByQuery(query: Query<AuthorizeRecord>, queryOptions?: QueryOptions): Promise<AuthorizeRecord[]> {
    return this.service.findAllByQuery(this.agentContext, query, queryOptions)
  }

  private async send(connectionId: string, message: DidCommMessage, associatedRecord: AuthorizeRecord): Promise<void> {
    const connectionRecord = await this.connectionService.getById(this.agentContext, connectionId)
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, {
      message,
      connectionRecord,
      associatedRecord,
    })
    await this.messageSender.sendMessage(outbound)
  }
}
