import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateStepMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `step` (holder): recorded `step-received`; the host shows it in the authentication sheet. */
export class AuthenticateStepHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthenticateStepMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthenticateStepHandler>) {
    await this.service.processStep(messageContext)
    return undefined
  }
}
