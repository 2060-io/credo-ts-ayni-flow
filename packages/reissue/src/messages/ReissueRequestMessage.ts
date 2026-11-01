import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Type } from 'class-transformer'
import { IsString, ValidateNested } from 'class-validator'

import { ReissueReferenceModel, type ReissueRequest } from '../fields'
import { REISSUE_REQUEST_TYPE } from './ReissueProtocol'

export interface ReissueRequestMessageOptions extends ReissueRequest {
  id?: string
  /** The flow id (`~thread.pthid`); the holder opens the `reissue` flow itself. */
  parentThreadId?: string
}

/** `reissue/1.0/request` (profile §6.11); answered by an `issue` flow or a problem report, never by a reissue message. */
export class ReissueRequestMessage extends DidCommMessage {
  public constructor(options: ReissueRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.reference = new ReissueReferenceModel(options.reference)
      this.reason = options.reason
    }
  }

  public static readonly type = parseMessageType(REISSUE_REQUEST_TYPE)
  @IsValidMessageType(ReissueRequestMessage.type)
  public readonly type = ReissueRequestMessage.type.messageTypeUri

  @ValidateNested()
  @Type(() => ReissueReferenceModel)
  public reference!: ReissueReferenceModel

  @IsString()
  public reason!: string

  public toRequest(): ReissueRequest {
    return {
      reference: {
        credentialId: this.reference.credentialId,
        schemaId: this.reference.schemaId,
        credDefId: this.reference.credDefId,
        issuedAt: this.reference.issuedAt.toISOString(),
      },
      reason: this.reason,
    }
  }
}
