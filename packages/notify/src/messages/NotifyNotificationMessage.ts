import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose } from 'class-transformer'
import { IsIn, IsOptional, IsString } from 'class-validator'

import { NOTIFY_PRIORITIES, type NotifyNotification, type NotifyPriority } from '../fields'
import { NOTIFY_NOTIFICATION_TYPE } from './NotifyProtocol'

export interface NotifyNotificationMessageOptions extends NotifyNotification {
  id?: string
  /** The flow id (`~thread.pthid`); a `notify` flow is one message and needs no `close`. */
  parentThreadId?: string
}

/** `notify/1.0/notification` (profile §6.10): one message, no response. */
export class NotifyNotificationMessage extends DidCommMessage {
  public constructor(options: NotifyNotificationMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      if (options.parentThreadId) this.setThread({ parentThreadId: options.parentThreadId })
      this.conversationId = options.conversationId
      this.sessionId = options.sessionId ?? null
      this.title = options.title
      this.preview = options.preview ?? null
      this.collapseKey = options.collapseKey
      this.priority = options.priority
    }
  }

  public static readonly type = parseMessageType(NOTIFY_NOTIFICATION_TYPE)
  @IsValidMessageType(NotifyNotificationMessage.type)
  public readonly type = NotifyNotificationMessage.type.messageTypeUri

  @Expose({ name: 'conversation_id' })
  @IsString()
  public conversationId!: string

  @Expose({ name: 'session_id' })
  @IsOptional()
  @IsString()
  public sessionId: string | null = null

  @IsString()
  public title!: string

  @IsOptional()
  @IsString()
  public preview: string | null = null

  @Expose({ name: 'collapse_key' })
  @IsString()
  public collapseKey!: string

  @IsIn(NOTIFY_PRIORITIES)
  public priority!: NotifyPriority

  public toNotification(): NotifyNotification {
    return {
      conversationId: this.conversationId,
      sessionId: this.sessionId,
      title: this.title,
      preview: this.preview,
      collapseKey: this.collapseKey,
      priority: this.priority,
    }
  }
}
