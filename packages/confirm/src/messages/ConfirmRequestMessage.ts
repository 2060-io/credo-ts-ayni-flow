import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsBoolean, IsString } from 'class-validator'

import type { ConfirmRequest } from '../fields'
import { CONFIRM_REQUEST_TYPE } from './ConfirmProtocol'

export interface ConfirmRequestMessageOptions extends ConfirmRequest {
  id?: string
  /** The flow id when the request runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
}

/** `confirm/1.0/request` (profile §6.6). */
export class ConfirmRequestMessage extends DidCommMessage {
  public constructor(options: ConfirmRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.text = options.text
      this.code = options.code
      this.attested = options.attested
    }
  }

  public static readonly type = parseMessageType(CONFIRM_REQUEST_TYPE)
  @IsValidMessageType(ConfirmRequestMessage.type)
  public readonly type = ConfirmRequestMessage.type.messageTypeUri

  @IsString()
  public text!: string

  @IsString()
  public code!: string

  @IsBoolean()
  public attested!: boolean

  public toRequest(): ConfirmRequest {
    return { text: this.text, code: this.code, attested: this.attested }
  }
}
