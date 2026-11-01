import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { SessionGrantGrantMessage } from '../messages'
import type { SessionGrantService } from '../services'

export class SessionGrantResponseHandler implements DidCommMessageHandler {
  public supportedMessages = [SessionGrantGrantMessage]

  public constructor(private readonly service: SessionGrantService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<SessionGrantResponseHandler>) {
    await this.service.processResponse(messageContext)
    return undefined
  }
}
