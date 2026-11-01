import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { LinkSessionResponseMessage } from '../messages'
import type { LinkSessionService } from '../services'

export class LinkSessionResponseHandler implements DidCommMessageHandler {
  public supportedMessages = [LinkSessionResponseMessage]

  public constructor(private readonly service: LinkSessionService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<LinkSessionResponseHandler>) {
    await this.service.processResponse(messageContext)
    return undefined
  }
}
