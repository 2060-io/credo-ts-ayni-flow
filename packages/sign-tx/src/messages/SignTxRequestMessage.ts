import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsIn, IsObject, IsString, ValidateNested } from 'class-validator'

import { SIGN_TX_BROADCASTERS, type SignTxBroadcaster, type SignTxRequest, SignTxSignDocModel } from '../fields'
import { SIGN_TX_REQUEST_TYPE } from './SignTxProtocol'

export interface SignTxRequestMessageOptions extends SignTxRequest {
  id?: string
  /** The flow id when the request runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
}

/** `sign-tx/1.0/request` (profile §6.9). */
export class SignTxRequestMessage extends DidCommMessage {
  public constructor(options: SignTxRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.chainId = options.chainId
      this.signDoc = new SignTxSignDocModel(options.signDoc)
      this.summary = options.summary
      this.broadcast = options.broadcast
    }
  }

  public static readonly type = parseMessageType(SIGN_TX_REQUEST_TYPE)
  @IsValidMessageType(SignTxRequestMessage.type)
  public readonly type = SignTxRequestMessage.type.messageTypeUri

  @Expose({ name: 'chain_id' })
  @IsString()
  public chainId!: string

  @Expose({ name: 'sign_doc' })
  @ValidateNested()
  @Type(() => SignTxSignDocModel)
  public signDoc!: SignTxSignDocModel

  @IsObject()
  public summary!: Record<string, unknown>

  @IsIn(SIGN_TX_BROADCASTERS)
  public broadcast!: SignTxBroadcaster

  public toRequest(): SignTxRequest {
    return {
      chainId: this.chainId,
      signDoc: {
        bodyBytes: this.signDoc.bodyBytes,
        authInfoBytes: this.signDoc.authInfoBytes,
        accountNumber: this.signDoc.accountNumber,
      },
      summary: { ...this.summary },
      broadcast: this.broadcast,
    }
  }
}
