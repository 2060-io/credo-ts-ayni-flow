import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'

import { AttestationModel, AUTHORIZE_DECISIONS, type AuthorizeDecision, type AuthorizeResponse } from '../fields'
import { AUTHORIZE_RESPONSE_TYPE } from './AuthorizeProtocol'

export interface AuthorizeResponseMessageOptions extends AuthorizeResponse {
  id?: string
  /** The `@id` of the request being answered (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `authorize/1.0/response` (profile §6.5). */
export class AuthorizeResponseMessage extends DidCommMessage {
  public constructor(options: AuthorizeResponseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.decision = options.decision
      this.attestation = new AttestationModel(options.attestation)
      this.comment = options.comment ?? null
    }
  }

  public static readonly type = parseMessageType(AUTHORIZE_RESPONSE_TYPE)
  @IsValidMessageType(AuthorizeResponseMessage.type)
  public readonly type = AuthorizeResponseMessage.type.messageTypeUri

  @IsIn(AUTHORIZE_DECISIONS)
  public decision!: AuthorizeDecision

  @ValidateNested()
  @Type(() => AttestationModel)
  public attestation!: AttestationModel

  @IsOptional()
  @IsString()
  public comment: string | null = null

  public toResponse(): AuthorizeResponse {
    return {
      decision: this.decision,
      attestation: { method: this.attestation.method, at: this.attestation.at.toISOString() },
      comment: this.comment,
    }
  }
}
