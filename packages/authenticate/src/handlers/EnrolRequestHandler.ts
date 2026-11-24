import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateModuleConfig } from '../AuthenticateModuleConfig'
import { EnrolRequestMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `enrol-request` (service): recorded `request-received`; the host checks the connection is eligible (§6.4). */
export class EnrolRequestHandler implements DidCommMessageHandler {
  public supportedMessages = [EnrolRequestMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<EnrolRequestHandler>) {
    if (!messageContext.agentContext.dependencyManager.resolve(AuthenticateModuleConfig).isRequester) {
      messageContext.agentContext.config.logger.debug(
        'authenticate: EnrolRequestMessage ignored, this agent is not a requester'
      )
      return undefined
    }
    await this.service.processEnrolRequest(messageContext)
    return undefined
  }
}
