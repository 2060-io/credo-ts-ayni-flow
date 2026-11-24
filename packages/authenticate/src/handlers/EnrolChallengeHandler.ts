import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { EnrolChallengeMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `enrol-challenge` (holder): recorded `challenge-received`; the event carries the challenge in full. */
export class EnrolChallengeHandler implements DidCommMessageHandler {
  public supportedMessages = [EnrolChallengeMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<EnrolChallengeHandler>) {
    await this.service.processEnrolChallenge(messageContext)
    return undefined
  }
}
