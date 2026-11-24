import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsInt, IsObject, IsOptional, IsString } from 'class-validator'

import { type EnrolChallenge, fromWire, type PasskeyCreationOptions, toWire } from '../fields'
import { AUTHENTICATE_ENROL_CHALLENGE_TYPE } from './AuthenticateProtocol'

export interface EnrolChallengeMessageOptions extends EnrolChallenge {
  id?: string
  /** The `@id` of the enrol-request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/**
 * `authenticate/1.0/enrol-challenge` (profile §6.4): the creation options of a passkey, or the secret of an
 * authenticator app; sent again after a wrong code.
 */
export class EnrolChallengeMessage extends DidCommMessage {
  public constructor(options: EnrolChallengeMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.methodType = options.type
      if (options.publicKey !== undefined) this.publicKey = toWire(options.publicKey)
      if (options.secret !== undefined) this.secret = options.secret
      if (options.otpauthUri !== undefined) this.otpauthUri = options.otpauthUri
      if (options.digits !== undefined) this.digits = options.digits
      if (options.period !== undefined) this.period = options.period
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_ENROL_CHALLENGE_TYPE)
  @IsValidMessageType(EnrolChallengeMessage.type)
  public readonly type = EnrolChallengeMessage.type.messageTypeUri

  /** The type enrolled, `type` on the wire. */
  @Expose({ name: 'type' })
  @IsString()
  public methodType!: string

  /** As it travels (`display_name`, `pub_key_cred_params`, `authenticator_selection`...). */
  @Expose({ name: 'public_key' })
  @IsOptional()
  @IsObject()
  public publicKey?: Record<string, unknown>

  @IsOptional()
  @IsString()
  public secret?: string

  @Expose({ name: 'otpauth_uri' })
  @IsOptional()
  @IsString()
  public otpauthUri?: string

  @IsOptional()
  @IsInt()
  public digits?: number

  @IsOptional()
  @IsInt()
  public period?: number

  public toChallenge(): EnrolChallenge {
    return {
      type: this.methodType as EnrolChallenge['type'],
      ...(this.publicKey !== undefined ? { publicKey: fromWire<PasskeyCreationOptions>(this.publicKey) } : {}),
      ...(this.secret !== undefined ? { secret: this.secret } : {}),
      ...(this.otpauthUri !== undefined ? { otpauthUri: this.otpauthUri } : {}),
      ...(this.digits !== undefined ? { digits: this.digits } : {}),
      ...(this.period !== undefined ? { period: this.period } : {}),
    }
  }
}
