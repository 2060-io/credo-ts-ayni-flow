import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { EnrolAnswerMessage } from '../messages'
import type { AuthenticateService } from '../services'

/** Inbound `enrol-answer` (service): recorded `answer-received`; the host verifies it. */
export class EnrolAnswerHandler implements DidCommMessageHandler {
  public supportedMessages = [EnrolAnswerMessage]

  public constructor(private readonly service: AuthenticateService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<EnrolAnswerHandler>) {
    await this.service.processEnrolAnswer(messageContext)
    return undefined
  }
}
