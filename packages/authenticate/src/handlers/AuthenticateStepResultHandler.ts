import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateStepResultMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `step-result` (holder): recorded `step-result-received`. */
export class AuthenticateStepResultHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthenticateStepResultMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthenticateStepResultHandler>) {
    await this.service.processStepResult(messageContext)
    return undefined
  }
}
