import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { SignTxRequestMessage } from '../messages'
import type { SignTxService } from '../services'

export class SignTxRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [SignTxRequestMessage]

  public constructor(private readonly service: SignTxService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<SignTxRequestHandler>) {
    await this.service.processRequest(messageContext)
    return undefined
  }
}
