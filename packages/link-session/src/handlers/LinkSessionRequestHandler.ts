import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { LinkSessionRequestMessage } from '../messages'
import type { LinkSessionService } from '../services'

export class LinkSessionRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [LinkSessionRequestMessage]

  public constructor(private readonly service: LinkSessionService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<LinkSessionRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
