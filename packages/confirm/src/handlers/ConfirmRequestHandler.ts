import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { ConfirmRequestMessage } from '../messages'
import type { ConfirmService } from '../services'

export class ConfirmRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [ConfirmRequestMessage]

  public constructor(private readonly service: ConfirmService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<ConfirmRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
