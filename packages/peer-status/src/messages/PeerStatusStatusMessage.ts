import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator'

import { type PeerStatus, PeerStatusAuthenticationModel, PeerStatusRefusalModel } from '../fields'
import { PEER_STATUS_STATUS_TYPE } from './PeerStatusProtocol'

export interface PeerStatusStatusMessageOptions extends PeerStatus {
  id?: string
}

/** `peer-status/1.0/status` (profile §4.1): one message, outside any flow, that replaces the status before it. */
export class PeerStatusStatusMessage extends DidCommMessage {
  public constructor(options: PeerStatusStatusMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.authentication = new PeerStatusAuthenticationModel(options.authentication)
      this.identified = options.identified
      this.open = [...options.open]
      if (options.refusal) this.refusal = new PeerStatusRefusalModel(options.refusal)
    }
  }

  public static readonly type = parseMessageType(PEER_STATUS_STATUS_TYPE)
  @IsValidMessageType(PeerStatusStatusMessage.type)
  public readonly type = PeerStatusStatusMessage.type.messageTypeUri

  @ValidateNested()
  @Type(() => PeerStatusAuthenticationModel)
  public authentication!: PeerStatusAuthenticationModel

  @IsBoolean()
  public identified!: boolean

  @IsArray()
  @IsString({ each: true })
  public open!: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusRefusalModel)
  public refusal?: PeerStatusRefusalModel

  public toStatus(): PeerStatus {
    const { credential, issuers, obtain } = this.authentication
    return {
      authentication: {
        rule: this.authentication.rule,
        ...(credential ? { credential: { jsonSchemaCredentialId: credential.jsonSchemaCredentialId } } : {}),
        ...(issuers ? { issuers: [...issuers] } : {}),
        ...(obtain
          ? {
              obtain: {
                ...(obtain.text !== undefined ? { text: obtain.text } : {}),
                ...(obtain.url !== undefined ? { url: obtain.url } : {}),
              },
            }
          : {}),
      },
      identified: this.identified,
      open: [...this.open],
      ...(this.refusal
        ? {
            refusal: {
              code: this.refusal.code,
              ...(this.refusal.comment !== undefined ? { comment: this.refusal.comment } : {}),
            },
          }
        : {}),
    }
  }
}
