import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateModuleConfig } from '../AuthenticateModuleConfig'
import { AuthenticateRequestMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `request` (holder): recorded `request-received`; the host shows the sheet of §6.14. */
export class AuthenticateRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [AuthenticateRequestMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AuthenticateRequestHandler>) {
    if (!messageContext.agentContext.dependencyManager.resolve(AuthenticateModuleConfig).isAuthenticator) {
      messageContext.agentContext.config.logger.debug(
        'authenticate: AuthenticateRequestMessage ignored, this agent is not an authenticator'
      )
      return undefined
    }
    await this.service.processRequest(messageContext)
    return undefined
  }
}
