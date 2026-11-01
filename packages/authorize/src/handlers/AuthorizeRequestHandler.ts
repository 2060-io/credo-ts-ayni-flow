import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthorizeRequestMessage } from '../messages'
import type { AuthorizeService } from '../services'

export class AuthorizeRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthorizeRequestMessage]

  public constructor(private readonly service: AuthorizeService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthorizeRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
