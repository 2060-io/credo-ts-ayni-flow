import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { SignTxResponseMessage } from '../messages'
import type { SignTxService } from '../services'

export class SignTxResponseHandler implements DidCommMessageHandler {
  public supportedMessages = [SignTxResponseMessage]

  public constructor(private readonly service: SignTxService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<SignTxResponseHandler>) {
    await this.service.processResponse(messageContext)
    return undefined
  }
}
