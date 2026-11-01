import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AyniFlowProblemReportMessage } from '../messages'
import type { AyniFlowService } from '../services'

/** Inbound report-problem 1.0 `problem-report`; one with `~thread.pthid` naming a flow closes it `failed`. */
export class AyniFlowProblemReportHandler implements DidCommMessageHandler {
  public supportedMessages = [AyniFlowProblemReportMessage]

  public constructor(private readonly service: AyniFlowService) {}

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<AyniFlowProblemReportHandler>) {
    await this.service.processProblemReport(messageContext)
    return undefined
  }
}
