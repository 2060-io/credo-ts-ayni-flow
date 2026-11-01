import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Type } from 'class-transformer'
import { IsBoolean, ValidateNested } from 'class-validator'

import { AttestationModel, type ConfirmResponse } from '../fields'
import { CONFIRM_RESPONSE_TYPE } from './ConfirmProtocol'

export interface ConfirmResponseMessageOptions extends ConfirmResponse {
  id?: string
  /** The `@id` of the request being answered (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `confirm/1.0/response` (profile §6.6). */
export class ConfirmResponseMessage extends DidCommMessage {
  public constructor(options: ConfirmResponseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.confirmed = options.confirmed
      this.attestation = new AttestationModel(options.attestation)
    }
  }

  public static readonly type = parseMessageType(CONFIRM_RESPONSE_TYPE)
  @IsValidMessageType(ConfirmResponseMessage.type)
  public readonly type = ConfirmResponseMessage.type.messageTypeUri

  @IsBoolean()
  public confirmed!: boolean

  @ValidateNested()
  @Type(() => AttestationModel)
  public attestation!: AttestationModel

  public toResponse(): ConfirmResponse {
    return {
      confirmed: this.confirmed,
      attestation: { method: this.attestation.method, at: this.attestation.at.toISOString() },
    }
  }
}
