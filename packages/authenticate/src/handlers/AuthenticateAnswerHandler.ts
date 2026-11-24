import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateAnswerMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `answer` (service): recorded `answer-received`. */
export class AuthenticateAnswerHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthenticateAnswerMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthenticateAnswerHandler>) {
    await this.service.processAnswer(messageContext)
    return undefined
  }
}
