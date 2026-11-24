import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsString } from 'class-validator'

import type { Unenrol } from '../fields'
import { AUTHENTICATE_UNENROL_TYPE } from './AuthenticateProtocol'

/**
 * `authenticate/1.0/unenrol` (profile §6.4): the holder removes an enrolled method, outside any flow. The service
 * answers with a peer status whose `enrolled` no longer lists it.
 */
export class UnenrolMessage extends DidCommMessage {
  public constructor(options: Unenrol & { id?: string }) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.methodType = options.type
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_UNENROL_TYPE)
  @IsValidMessageType(UnenrolMessage.type)
  public readonly type = UnenrolMessage.type.messageTypeUri

  /** The type removed, `type` on the wire. */
  @Expose({ name: 'type' })
  @IsString()
  public methodType!: string

  public toUnenrol(): Unenrol {
    return { type: this.methodType as Unenrol['type'] }
  }
}
