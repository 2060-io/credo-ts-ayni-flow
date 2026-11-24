import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator'

import { type AuthenticateAnswer, fromWire, type PasskeyAssertion, toWire } from '../fields'
import { AUTHENTICATE_ANSWER_TYPE } from './AuthenticateProtocol'

export interface AuthenticateAnswerMessageOptions extends AuthenticateAnswer {
  id?: string
  /** The `@id` of the request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `authenticate/1.0/answer` (profile §6.14): what the person gave for a step's `ask`, taken in the sheet. */
export class AuthenticateAnswerMessage extends DidCommMessage {
  public constructor(options: AuthenticateAnswerMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.step = options.step
      if (options.address !== undefined) this.address = options.address
      if (options.locale !== undefined) this.locale = options.locale
      if (options.code !== undefined) this.code = options.code
      if (options.newCode !== undefined) this.newCode = options.newCode
      if (options.consent !== undefined) this.consent = options.consent
      if (options.assertion !== undefined) this.assertion = toWire(options.assertion)
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_ANSWER_TYPE)
  @IsValidMessageType(AuthenticateAnswerMessage.type)
  public readonly type = AuthenticateAnswerMessage.type.messageTypeUri

  @IsString()
  public step!: string

  @IsOptional()
  @IsString()
  public address?: string

  @IsOptional()
  @IsString()
  public locale?: string

  @IsOptional()
  @IsString()
  public code?: string

  @Expose({ name: 'new_code' })
  @IsOptional()
  @IsBoolean()
  public newCode?: boolean

  @IsOptional()
  @IsBoolean()
  public consent?: boolean

  /** As it travels (`client_data_json`, `authenticator_data`, `user_handle`). */
  @IsOptional()
  @IsObject()
  public assertion?: Record<string, unknown>

  public toAnswer(): AuthenticateAnswer {
    return {
      step: this.step,
      ...(this.address !== undefined ? { address: this.address } : {}),
      ...(this.locale !== undefined ? { locale: this.locale } : {}),
      ...(this.code !== undefined ? { code: this.code } : {}),
      ...(this.newCode !== undefined ? { newCode: this.newCode } : {}),
      ...(this.consent !== undefined ? { consent: this.consent } : {}),
      ...(this.assertion !== undefined ? { assertion: fromWire<PasskeyAssertion>(this.assertion) } : {}),
    }
  }
}
