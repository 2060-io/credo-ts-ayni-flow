import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsInt, IsOptional, IsString } from 'class-validator'

import type { AuthenticateStep } from '../fields'
import { AUTHENTICATE_STEP_TYPE } from './AuthenticateProtocol'

export interface AuthenticateStepMessageOptions extends AuthenticateStep {
  id?: string
  /** The `@id` of the request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

const OPTIONAL_FIELDS = [
  'ask',
  'text',
  'expiresAt',
  'triesLeft',
  'newCodesLeft',
  'challenge',
  'rpId',
  'error',
  'reason',
] as const

/** `authenticate/1.0/step` (profile §6.14): the service announces a step, or sends it again. */
export class AuthenticateStepMessage extends DidCommMessage {
  public constructor(options: AuthenticateStepMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.step = options.step
      this.method = options.method
      this.methodType = options.type
      for (const field of OPTIONAL_FIELDS) {
        if (options[field] !== undefined) (this as Record<string, unknown>)[field] = options[field]
      }
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_STEP_TYPE)
  @IsValidMessageType(AuthenticateStepMessage.type)
  public readonly type = AuthenticateStepMessage.type.messageTypeUri

  @IsString()
  public step!: string

  @IsString()
  public method!: string

  /** The method's type, `type` on the wire (the message's own `@type` keeps the name `type` in Credo). */
  @Expose({ name: 'type' })
  @IsString()
  public methodType!: string

  @IsOptional()
  @IsString()
  public ask?: AuthenticateStep['ask']

  @IsOptional()
  @IsString()
  public text?: string

  @Expose({ name: 'expires_at' })
  @IsOptional()
  @IsString()
  public expiresAt?: string

  @Expose({ name: 'tries_left' })
  @IsOptional()
  @IsInt()
  public triesLeft?: number

  @Expose({ name: 'new_codes_left' })
  @IsOptional()
  @IsInt()
  public newCodesLeft?: number

  @IsOptional()
  @IsString()
  public challenge?: string

  @Expose({ name: 'rp_id' })
  @IsOptional()
  @IsString()
  public rpId?: string

  @IsOptional()
  @IsString()
  public error?: AuthenticateStep['error']

  @IsOptional()
  @IsString()
  public reason?: AuthenticateStep['reason']

  public toStep(): AuthenticateStep {
    const step: AuthenticateStep = { step: this.step, method: this.method, type: this.methodType }
    for (const field of OPTIONAL_FIELDS) {
      const value = (this as Record<string, unknown>)[field]
      if (value !== undefined) (step as unknown as Record<string, unknown>)[field] = value
    }
    return step
  }
}
