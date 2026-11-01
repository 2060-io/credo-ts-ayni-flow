import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthorizeResponseMessage } from '../messages'
import type { AuthorizeService } from '../services'

export class AuthorizeResponseHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthorizeResponseMessage]

  public constructor(private readonly service: AuthorizeService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthorizeResponseHandler>) {
    await this.service.processResponse(messageContext)
    return undefined
  }
}
