import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsOptional, IsString } from 'class-validator'

import type { AuthenticateStepResult } from '../fields'
import { AUTHENTICATE_STEP_RESULT_TYPE } from './AuthenticateProtocol'

export interface AuthenticateStepResultMessageOptions extends AuthenticateStepResult {
  id?: string
  /** The `@id` of the request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `authenticate/1.0/step-result` (profile §6.14): the end of a step, `passed`, `failed` or `expired`. */
export class AuthenticateStepResultMessage extends DidCommMessage {
  public constructor(options: AuthenticateStepResultMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.step = options.step
      this.outcome = options.outcome
      if (options.reason !== undefined) this.reason = options.reason
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_STEP_RESULT_TYPE)
  @IsValidMessageType(AuthenticateStepResultMessage.type)
  public readonly type = AuthenticateStepResultMessage.type.messageTypeUri

  @IsString()
  public step!: string

  @IsString()
  public outcome!: AuthenticateStepResult['outcome']

  @IsOptional()
  @IsString()
  public reason?: string

  public toStepResult(): AuthenticateStepResult {
    return {
      step: this.step,
      outcome: this.outcome,
      ...(this.reason !== undefined ? { reason: this.reason } : {}),
    }
  }
}
