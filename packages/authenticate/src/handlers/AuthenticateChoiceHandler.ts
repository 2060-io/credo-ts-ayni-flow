import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateChoiceMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `choice` (service): recorded `choice-received`, or `failed` (`malformed`) when it is not one of the combinations. */
export class AuthenticateChoiceHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthenticateChoiceMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthenticateChoiceHandler>) {
    await this.service.processChoice(messageContext)
    return undefined
  }
}
