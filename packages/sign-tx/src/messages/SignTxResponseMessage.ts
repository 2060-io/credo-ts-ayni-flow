import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'

import { SIGN_TX_STATUSES, SignTxPublicKeyModel, type SignTxResponse, type SignTxStatus } from '../fields'
import { SIGN_TX_RESPONSE_TYPE } from './SignTxProtocol'

export interface SignTxResponseMessageOptions extends SignTxResponse {
  id?: string
  /** The `@id` of the request being answered (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `sign-tx/1.0/response` (profile §6.9). */
export class SignTxResponseMessage extends DidCommMessage {
  public constructor(options: SignTxResponseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.signature = options.signature ?? null
      this.publicKey = options.publicKey ? new SignTxPublicKeyModel(options.publicKey) : null
      this.txHash = options.txHash ?? null
      this.status = options.status
      this.reason = options.reason ?? null
    }
  }

  public static readonly type = parseMessageType(SIGN_TX_RESPONSE_TYPE)
  @IsValidMessageType(SignTxResponseMessage.type)
  public readonly type = SignTxResponseMessage.type.messageTypeUri

  @IsOptional()
  @IsString()
  public signature: string | null = null

  @Expose({ name: 'public_key' })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignTxPublicKeyModel)
  public publicKey: SignTxPublicKeyModel | null = null

  @Expose({ name: 'tx_hash' })
  @IsOptional()
  @IsString()
  public txHash: string | null = null

  @IsIn(SIGN_TX_STATUSES)
  public status!: SignTxStatus

  @IsOptional()
  @IsString()
  public reason: string | null = null

  public toResponse(): SignTxResponse {
    return {
      signature: this.signature,
      publicKey: this.publicKey ? { type: this.publicKey.type, value: this.publicKey.value } : null,
      txHash: this.txHash,
      status: this.status,
      reason: this.reason,
    }
  }
}
