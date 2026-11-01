import {
  DidCommProblemReportMessage,
  type DidCommProblemReportMessageOptions,
  IsValidMessageType,
  parseMessageType,
} from '@credo-ts/didcomm'

import { AYNI_FLOW_PROBLEM_REPORT_TYPE } from './AyniFlowProtocol'

export interface AyniFlowProblemReportMessageOptions extends DidCommProblemReportMessageOptions {
  /** The flow id, set as `~thread.pthid` (profile §5.1, FLOW-ERR-001). */
  flowId: string
  /** The message the report is about, set as `~thread.thid`; defaults to the flow id (a report on the `open` itself). */
  threadId?: string
}

/**
 * report-problem 1.0 `problem-report` with `~thread.pthid` = flow id and `description.code` from profile §11.
 * Credo's base class is typed `notification/1.0/problem-report`; the profile requires the RFC 0035 URI.
 */
export class AyniFlowProblemReportMessage extends DidCommProblemReportMessage {
  public constructor(options: AyniFlowProblemReportMessageOptions) {
    super(options)

    if (options) {
      this.setThread({ threadId: options.threadId ?? options.flowId, parentThreadId: options.flowId })
    }
  }

  public static readonly type = parseMessageType(AYNI_FLOW_PROBLEM_REPORT_TYPE)
  @IsValidMessageType(AyniFlowProblemReportMessage.type)
  public readonly type = AyniFlowProblemReportMessage.type.messageTypeUri

  /** The flow the report belongs to: `~thread.pthid`. */
  public get flowId(): string | undefined {
    return this.thread?.parentThreadId
  }
}
