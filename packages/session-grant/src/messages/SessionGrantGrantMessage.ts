import { DateTransformer } from '@credo-ts/core'
import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsDate, IsString } from 'class-validator'

import type { SessionGrantResponse } from '../fields'
import { SESSION_GRANT_RESPONSE_TYPE } from './SessionGrantProtocol'

export interface SessionGrantGrantMessageOptions extends SessionGrantResponse {
  id?: string
  /** The `@id` of the request being answered (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `session-grant/1.0/grant` (profile §6.8): the agent's answer to a `request`. */
export class SessionGrantGrantMessage extends DidCommMessage {
  public constructor(options: SessionGrantGrantMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      this.grant = options.grant
      this.sessionsUrl = options.sessionsUrl
      this.expiresAt = new Date(options.expiresAt)
    }
  }

  public static readonly type = parseMessageType(SESSION_GRANT_RESPONSE_TYPE)
  @IsValidMessageType(SessionGrantGrantMessage.type)
  public readonly type = SessionGrantGrantMessage.type.messageTypeUri

  @IsString()
  public grant!: string

  @Expose({ name: 'sessions_url' })
  @IsString()
  public sessionsUrl!: string

  @Expose({ name: 'expires_at' })
  @IsDate()
  @DateTransformer()
  public expiresAt!: Date

  public toResponse(): SessionGrantResponse {
    return { grant: this.grant, sessionsUrl: this.sessionsUrl, expiresAt: this.expiresAt.toISOString() }
  }
}
