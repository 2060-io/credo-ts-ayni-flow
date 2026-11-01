import { DateTransformer } from '@credo-ts/core'
import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsArray, IsBoolean, IsDate, IsString, ValidateNested } from 'class-validator'

import { AuthorizePurposeModel, type AuthorizeRequest, AuthorizeRequesterModel } from '../fields'
import { AUTHORIZE_REQUEST_TYPE } from './AuthorizeProtocol'

export interface AuthorizeRequestMessageOptions extends AuthorizeRequest {
  id?: string
  /** The flow id when the request runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
}

/** `authorize/1.0/request` (profile §6.5). */
export class AuthorizeRequestMessage extends DidCommMessage {
  public constructor(options: AuthorizeRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.requester = new AuthorizeRequesterModel(options.requester)
      this.purpose = new AuthorizePurposeModel(options.purpose)
      this.justification = options.justification
      this.scope = options.scope
      this.expiresAt = new Date(options.expiresAt)
      this.attested = options.attested
    }
  }

  public static readonly type = parseMessageType(AUTHORIZE_REQUEST_TYPE)
  @IsValidMessageType(AuthorizeRequestMessage.type)
  public readonly type = AuthorizeRequestMessage.type.messageTypeUri

  @ValidateNested()
  @Type(() => AuthorizeRequesterModel)
  public requester!: AuthorizeRequesterModel

  @ValidateNested()
  @Type(() => AuthorizePurposeModel)
  public purpose!: AuthorizePurposeModel

  @IsString()
  public justification!: string

  @IsArray()
  @IsString({ each: true })
  public scope!: string[]

  @Expose({ name: 'expires_at' })
  @IsDate()
  @DateTransformer()
  public expiresAt!: Date

  @IsBoolean()
  public attested!: boolean

  public toRequest(): AuthorizeRequest {
    return {
      requester: { name: this.requester.name, role: this.requester.role, did: this.requester.did },
      purpose: { id: this.purpose.id, label: this.purpose.label },
      justification: this.justification,
      scope: [...this.scope],
      expiresAt: this.expiresAt.toISOString(),
      attested: this.attested,
    }
  }
}
