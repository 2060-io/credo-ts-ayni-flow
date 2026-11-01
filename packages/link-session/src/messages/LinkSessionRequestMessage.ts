import { DateTransformer } from '@credo-ts/core'
import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsArray, IsDate, IsOptional, IsString, ValidateNested } from 'class-validator'

import { LinkSessionAgentModel, LinkSessionBrowserModel, type LinkSessionRequest } from '../fields'
import { LINK_SESSION_REQUEST_TYPE } from './LinkSessionProtocol'

export interface LinkSessionRequestMessageOptions extends LinkSessionRequest {
  id?: string
  /** The flow id when the request runs inside an ayni-flow (`~thread.pthid`). */
  parentThreadId?: string
}

/** `link-session/1.0/request` (profile §6.7). */
export class LinkSessionRequestMessage extends DidCommMessage {
  public constructor(options: LinkSessionRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.agent = new LinkSessionAgentModel(options.agent)
      this.browser = new LinkSessionBrowserModel(options.browser)
      this.webOrigin = options.webOrigin
      this.startedAt = new Date(options.startedAt)
      this.invitationId = options.invitationId
      this.codes = options.codes ?? null
    }
  }

  public static readonly type = parseMessageType(LINK_SESSION_REQUEST_TYPE)
  @IsValidMessageType(LinkSessionRequestMessage.type)
  public readonly type = LinkSessionRequestMessage.type.messageTypeUri

  @ValidateNested()
  @Type(() => LinkSessionAgentModel)
  public agent!: LinkSessionAgentModel

  @ValidateNested()
  @Type(() => LinkSessionBrowserModel)
  public browser!: LinkSessionBrowserModel

  @Expose({ name: 'web_origin' })
  @IsString()
  public webOrigin!: string

  @Expose({ name: 'started_at' })
  @IsDate()
  @DateTransformer()
  public startedAt!: Date

  @Expose({ name: 'invitation_id' })
  @IsString()
  public invitationId!: string

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public codes: string[] | null = null

  public toRequest(): LinkSessionRequest {
    return {
      agent: { did: this.agent.did, name: this.agent.name },
      browser: { description: this.browser.description, platform: this.browser.platform },
      webOrigin: this.webOrigin,
      startedAt: this.startedAt.toISOString(),
      invitationId: this.invitationId,
      codes: this.codes ? [...this.codes] : null,
    }
  }
}
