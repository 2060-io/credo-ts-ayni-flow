import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator'

import { SessionGrantClientModel, type SessionGrantRequest } from '../fields'
import { SESSION_GRANT_REQUEST_TYPE } from './SessionGrantProtocol'

export interface SessionGrantRequestMessageOptions extends SessionGrantRequest {
  id?: string
  /** The flow id (`~thread.pthid`); the holder opens the `session-grant` flow itself. */
  parentThreadId?: string
}

/** `session-grant/1.0/request` (profile §6.8). */
export class SessionGrantRequestMessage extends DidCommMessage {
  public constructor(options: SessionGrantRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.agentDid = options.agentDid
      this.conversationId = options.conversationId ?? null
      this.newConversation = options.newConversation
      this.client = new SessionGrantClientModel(options.client)
    }
  }

  public static readonly type = parseMessageType(SESSION_GRANT_REQUEST_TYPE)
  @IsValidMessageType(SessionGrantRequestMessage.type)
  public readonly type = SessionGrantRequestMessage.type.messageTypeUri

  @Expose({ name: 'agent_did' })
  @IsString()
  public agentDid!: string

  @Expose({ name: 'conversation_id' })
  @IsOptional()
  @IsString()
  public conversationId: string | null = null

  @Expose({ name: 'new_conversation' })
  @IsBoolean()
  public newConversation!: boolean

  @ValidateNested()
  @Type(() => SessionGrantClientModel)
  public client!: SessionGrantClientModel

  public toRequest(): SessionGrantRequest {
    return {
      agentDid: this.agentDid,
      conversationId: this.conversationId,
      newConversation: this.newConversation,
      client: {
        description: this.client.description,
        platform: this.client.platform,
        appVersion: this.client.appVersion,
      },
    }
  }
}
