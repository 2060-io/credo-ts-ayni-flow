import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsString } from 'class-validator'

import type { EnrolRequest } from '../fields'
import { AUTHENTICATE_ENROL_REQUEST_TYPE } from './AuthenticateProtocol'

export interface EnrolRequestMessageOptions extends EnrolRequest {
  id?: string
  /** The id of the `enrol` flow the holder opened (`~thread.pthid`). */
  parentThreadId?: string
}

/** `authenticate/1.0/enrol-request` (profile §6.4): the holder asks to enrol an authenticator app or a passkey. */
export class EnrolRequestMessage extends DidCommMessage {
  public constructor(options: EnrolRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.methodType = options.type
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_ENROL_REQUEST_TYPE)
  @IsValidMessageType(EnrolRequestMessage.type)
  public readonly type = EnrolRequestMessage.type.messageTypeUri

  /** The type enrolled, `type` on the wire. */
  @Expose({ name: 'type' })
  @IsString()
  public methodType!: string

  public toEnrolRequest(): EnrolRequest {
    return { type: this.methodType as EnrolRequest['type'] }
  }
}
