import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { IsObject, IsOptional, IsString } from 'class-validator'

import { type EnrolAnswer, fromWire, type PasskeyAttestation, toWire } from '../fields'
import { AUTHENTICATE_ENROL_ANSWER_TYPE } from './AuthenticateProtocol'

export interface EnrolAnswerMessageOptions extends EnrolAnswer {
  id?: string
  /** The `@id` of the enrol-request (`~thread.thid`). */
  threadId: string
  parentThreadId?: string
}

/** `authenticate/1.0/enrol-answer` (profile §6.4): the passkey's attestation, or the authenticator app's code. */
export class EnrolAnswerMessage extends DidCommMessage {
  public constructor(options: EnrolAnswerMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.threadId, parentThreadId: options.parentThreadId })
      if (options.attestation !== undefined) this.attestation = toWire(options.attestation)
      if (options.code !== undefined) this.code = options.code
    }
  }

  public static readonly type = parseMessageType(AUTHENTICATE_ENROL_ANSWER_TYPE)
  @IsValidMessageType(EnrolAnswerMessage.type)
  public readonly type = EnrolAnswerMessage.type.messageTypeUri

  /** As it travels (`client_data_json`, `attestation_object`). */
  @IsOptional()
  @IsObject()
  public attestation?: Record<string, unknown>

  @IsOptional()
  @IsString()
  public code?: string

  public toEnrolAnswer(): EnrolAnswer {
    return {
      ...(this.attestation !== undefined ? { attestation: fromWire<PasskeyAttestation>(this.attestation) } : {}),
      ...(this.code !== undefined ? { code: this.code } : {}),
    }
  }
}
