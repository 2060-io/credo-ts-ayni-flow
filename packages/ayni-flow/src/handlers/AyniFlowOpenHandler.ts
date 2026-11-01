import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { DidCommOutboundMessageContext } from '@credo-ts/didcomm'

import { AyniFlowOpenMessage } from '../messages'
import type { AyniFlowService } from '../services'

/** Inbound `open`: records the flow `pending`, or answers the problem report that refuses it. */
export class AyniFlowOpenHandler implements DidCommMessageHandler {
  public supportedMessages = [AyniFlowOpenMessage]

  public constructor(private readonly service: AyniFlowService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AyniFlowOpenHandler>) {
    const { record, problemReport } = await this.service.processOpen(messageContext)
    if (!problemReport) return undefined

    return new DidCommOutboundMessageContext(problemReport, {
      agentContext: messageContext.agentContext,
      connection: messageContext.connection,
      associatedRecord: record,
    })
  }
}
