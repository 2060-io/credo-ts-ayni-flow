import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { ConfirmResponseMessage } from '../messages'
import type { ConfirmService } from '../services'

export class ConfirmResponseHandler implements DidCommMessageHandler {
  public supportedMessages = [ConfirmResponseMessage]

  public constructor(private readonly service: ConfirmService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<ConfirmResponseHandler>) {
    await this.service.processResponse(messageContext)
    return undefined
  }
}
