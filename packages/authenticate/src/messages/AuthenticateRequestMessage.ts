import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsArray, IsObject, IsOptional, IsString } from 'class-validator'

import { type AuthenticateRequest, type AuthenticationMethod, fromWire, toWire } from '../fields'
import { AUTHENTICATE_REQUEST_TYPE } from './AuthenticateProtocol'

export interface AuthenticateRequestMessageOptions extends AuthenticateRequest {
  id?: string
  /** The flow id (`~thread.pthid`): an `authenticate` flow, or the `enrol` flow it precedes. */
  parentThreadId?: string
}

/** `authenticate/1.0/request` (profile §6.14): why the service asks, the methods and the accepted combinations. */
export class AuthenticateRequestMessage extends DidCommMessage {
  public constructor(options: AuthenticateRequestMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: this.id, parentThreadId: options.parentThreadId })
      this.purpose = options.purpose
      this.methods = toWire(options.methods ?? {}) as Record<string, Record<string, unknown>>
      this.combinations = options.combinations.map((combination) => [...combination])
      if (options.text !== undefined) this.text = options.text
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_REQUEST_TYPE)
  @IsValidMessageType(AuthenticateRequestMessage.type)
  public readonly type = AuthenticateRequestMessage.type.messageTypeUri

  @IsString()
  public purpose!: string

  /** As it travels (snake_case); `toRequest()` gives the API's form. */
  @IsObject()
  public methods!: Record<string, Record<string, unknown>>

  @IsArray()
  @IsArray({ each: true })
  public combinations!: string[][]

  @IsOptional()
  @IsString()
  public text?: string

  public toRequest(): AuthenticateRequest {
    return {
      purpose: this.purpose as AuthenticateRequest['purpose'],
      methods: fromWire<Record<string, AuthenticationMethod>>(this.methods),
      combinations: this.combinations.map((combination) =>
        Array.isArray(combination) ? [...combination] : combination
      ),
      ...(this.text !== undefined ? { text: this.text } : {}),
    }
  }
}
