import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AyniFlowCloseMessage } from '../messages'
import type { AyniFlowService } from '../services'

/** Inbound `close`: the first close wins. */
export class AyniFlowCloseHandler implements DidCommMessageHandler {
  public supportedMessages = [AyniFlowCloseMessage]

  public constructor(private readonly service: AyniFlowService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AyniFlowCloseHandler>) {
    await this.service.processClose(messageContext)
    return undefined
  }
}
