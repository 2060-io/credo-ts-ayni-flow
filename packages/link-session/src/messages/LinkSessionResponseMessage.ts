import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsBoolean, IsOptional, IsString } from 'class-validator'

import type { LinkSessionResponse } from '../fields'
import { LINK_SESSION_RESPONSE_TYPE } from './LinkSessionProtocol'

export interface LinkSessionResponseMessageOptions extends LinkSessionResponse {
  id?: string
  /** The `@id` of the request being answered (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `link-session/1.0/response` (profile §6.7). */
export class LinkSessionResponseMessage extends DidCommMessage {
  public constructor(options: LinkSessionResponseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.link = options.link
      this.code = options.code ?? null
    }
  }

  public static readonly type = parseMessageType(LINK_SESSION_RESPONSE_TYPE)
  @IsValidMessageType(LinkSessionResponseMessage.type)
  public readonly type = LinkSessionResponseMessage.type.messageTypeUri

  @IsBoolean()
  public link!: boolean

  @IsOptional()
  @IsString()
  public code: string | null = null

  public toResponse(): LinkSessionResponse {
    return { link: this.link, code: this.code }
  }
}
