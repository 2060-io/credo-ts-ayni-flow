import type { Query, QueryOptions } from '@credo-ts/core'
import { AgentContext, injectable } from '@credo-ts/core'
import type { DidCommMessage } from '@credo-ts/didcomm'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import type { AyniFlowOriginOptions, AyniFlowReferenceOptions, AyniFlowStepOptions } from './models'
import type { AyniFlowRecord } from './repository'
import { AyniFlowService } from './services'
import type { AyniFlowErrorCode, AyniFlowOutcome } from './types'

export interface OpenFlowOptions {
  connectionId: string
  kind: string
  title: string
  description?: string
  origin: AyniFlowOriginOptions
  expiresTime: Date
  requires?: string[]
  steps?: AyniFlowStepOptions[]
}

export interface CloseFlowOptions {
  flowId: string
  outcome: AyniFlowOutcome
  /** A human-readable sentence for `failed` and `cancelled`. */
  reason?: string
  references?: AyniFlowReferenceOptions[]
}

export interface SendProblemReportOptions {
  flowId: string
  code: AyniFlowErrorCode | string
  description?: string
  /** The message the report is about (`~thread.thid`); defaults to the flow id. */
  threadId?: string
}

/**
 * The flow envelope (Ayni Flow Profile 1.0 §5). Carrier protocols (present-proof, authorize, sign-tx...) are sent by
 * their own modules with `parentThreadId` set to the flow id; this API opens and closes the flow around them.
 */
@injectable()
export class AyniFlowApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly service: AyniFlowService,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  /** Sends an `open`; the returned record's `flowId` is the `pthid` for every carrier message that follows. */
  public async openFlow(options: OpenFlowOptions): Promise<AyniFlowRecord> {
    const connection = await this.connectionService.getById(this.agentContext, options.connectionId)
    connection.assertReady()

    const { message, record } = await this.service.createOpen(this.agentContext, { ...options, connection })
    await this.send(connection.id, message, record)
    return record
  }

  /** Sends a `close` with the outcome (profile §5.1) and closes the flow locally. */
  public async closeFlow(options: CloseFlowOptions): Promise<AyniFlowRecord> {
    const record = await this.service.getByFlowId(this.agentContext, options.flowId)
    const message = await this.service.createClose(this.agentContext, record, options)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** Sends a report-problem 1.0 with `~thread.pthid` = flow id (profile §11) and closes the flow `failed` locally. */
  public async sendProblemReport(options: SendProblemReportOptions): Promise<AyniFlowRecord> {
    const record = await this.service.getByFlowId(this.agentContext, options.flowId)
    const message = await this.service.createProblemReport(this.agentContext, record, options)
    await this.send(record.connectionId, message, record)
    return record
  }

  /** `pending` to `active`; the module does this itself when a message with the flow's `pthid` is sent or received. */
  public markActive(flowId: string): Promise<AyniFlowRecord | null> {
    return this.service.markActive(this.agentContext, flowId)
  }

  /** Closes every open flow past its `expires_time` locally (FLOW-CORE-004); call it on wake-up when no timer runs. */
  public expireDueFlows(now = new Date()): Promise<AyniFlowRecord[]> {
    return this.service.expireDueFlows(this.agentContext, now)
  }

  public getById(id: string): Promise<AyniFlowRecord> {
    return this.service.getById(this.agentContext, id)
  }

  public findById(id: string): Promise<AyniFlowRecord | null> {
    return this.service.findById(this.agentContext, id)
  }

  public getByFlowId(flowId: string): Promise<AyniFlowRecord> {
    return this.service.getByFlowId(this.agentContext, flowId)
  }

  public findByFlowId(flowId: string): Promise<AyniFlowRecord | null> {
    return this.service.findByFlowId(this.agentContext, flowId)
  }

  public findAllByQuery(query: Query<AyniFlowRecord>, queryOptions?: QueryOptions): Promise<AyniFlowRecord[]> {
    return this.service.findAllByQuery(this.agentContext, query, queryOptions)
  }

  /** Flows `pending` or `active`, on one connection or all. */
  public findOpen(connectionId?: string): Promise<AyniFlowRecord[]> {
    return this.service.findOpen(this.agentContext, connectionId)
  }

  private async send(connectionId: string, message: DidCommMessage, associatedRecord: AyniFlowRecord): Promise<void> {
    const connectionRecord = await this.connectionService.getById(this.agentContext, connectionId)
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, {
      message,
      connectionRecord,
      associatedRecord,
    })
    await this.messageSender.sendMessage(outbound)
  }
}
