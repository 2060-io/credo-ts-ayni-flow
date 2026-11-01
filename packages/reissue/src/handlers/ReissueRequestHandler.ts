import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { ReissueRequestMessage } from '../messages'
import type { ReissueService } from '../services'

export class ReissueRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [ReissueRequestMessage]

  public constructor(private readonly service: ReissueService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<ReissueRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
