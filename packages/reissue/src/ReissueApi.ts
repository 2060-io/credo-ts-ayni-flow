import type { Query, QueryOptions } from '@credo-ts/core'
import { AgentContext, injectable } from '@credo-ts/core'
import type { DidCommMessage } from '@credo-ts/didcomm'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import type { ReissueRequest } from './fields'
import type { ReissueRecord } from './repository'
import { ReissueService } from './services'

export interface SendReissueRequestOptions {
  connectionId: string
  /** The flow id when the exchange runs inside an ayni-flow: set as `~thread.pthid` on every message (profile §2). */
  parentThreadId?: string
  request: ReissueRequest
}

/** `https://didcomm.org/reissue/1.0` (Ayni Flow Profile 1.0 §6.11). */
@injectable()
export class ReissueApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly service: ReissueService,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  /** Sends a `request`; the record's `threadId` is the request id the response answers. */
  public async request(options: SendReissueRequestOptions): Promise<ReissueRecord> {
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

  /** Records that the request was answered, by an `issue` flow or by a problem report, on either side. */
  public async markAnswered(threadId: string): Promise<ReissueRecord> {
    const record = await this.service.getByThreadId(this.agentContext, threadId)
    return this.service.markAnswered(this.agentContext, record)
  }

  /** Records a failure decided by the host (the person declined, the flow was refused...). */
  public async fail(threadId: string, code: string, description?: string): Promise<ReissueRecord> {
    const record = await this.service.getByThreadId(this.agentContext, threadId)
    return this.service.fail(this.agentContext, record, code, description)
  }

  public getById(id: string): Promise<ReissueRecord> {
    return this.service.getById(this.agentContext, id)
  }

  public findById(id: string): Promise<ReissueRecord | null> {
    return this.service.findById(this.agentContext, id)
  }

  public getByThreadId(threadId: string): Promise<ReissueRecord> {
    return this.service.getByThreadId(this.agentContext, threadId)
  }

  public findByThreadId(threadId: string): Promise<ReissueRecord | null> {
    return this.service.findByThreadId(this.agentContext, threadId)
  }

  /** The exchanges that ran inside one ayni-flow. */
  public findByFlowId(flowId: string): Promise<ReissueRecord[]> {
    return this.service.findByParentThreadId(this.agentContext, flowId)
  }

  public findAllByQuery(query: Query<ReissueRecord>, queryOptions?: QueryOptions): Promise<ReissueRecord[]> {
    return this.service.findAllByQuery(this.agentContext, query, queryOptions)
  }

  private async send(connectionId: string, message: DidCommMessage, associatedRecord: ReissueRecord): Promise<void> {
    const connectionRecord = await this.connectionService.getById(this.agentContext, connectionId)
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, {
      message,
      connectionRecord,
      associatedRecord,
    })
    await this.messageSender.sendMessage(outbound)
  }
}
