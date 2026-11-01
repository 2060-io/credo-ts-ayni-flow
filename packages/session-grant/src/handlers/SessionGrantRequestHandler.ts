import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { SessionGrantRequestMessage } from '../messages'
import type { SessionGrantService } from '../services'

export class SessionGrantRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [SessionGrantRequestMessage]

  public constructor(private readonly service: SessionGrantService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<SessionGrantRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
