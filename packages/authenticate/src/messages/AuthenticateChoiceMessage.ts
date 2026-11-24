import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsArray, IsString } from 'class-validator'

import type { AuthenticateChoice } from '../fields'
import { AUTHENTICATE_CHOICE_TYPE } from './AuthenticateProtocol'

export interface AuthenticateChoiceMessageOptions extends AuthenticateChoice {
  id?: string
  /** The `@id` of the request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `authenticate/1.0/choice` (profile §6.14): the method names of the combination the person chose. */
export class AuthenticateChoiceMessage extends DidCommMessage {
  public constructor(options: AuthenticateChoiceMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.combination = [...options.combination]
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_CHOICE_TYPE)
  @IsValidMessageType(AuthenticateChoiceMessage.type)
  public readonly type = AuthenticateChoiceMessage.type.messageTypeUri

  @IsArray()
  @IsString({ each: true })
  public combination!: string[]

  public toChoice(): AuthenticateChoice {
    return { combination: [...this.combination] }
  }
}
