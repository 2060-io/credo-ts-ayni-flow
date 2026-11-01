import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'

import { AyniFlowReference, type AyniFlowReferenceOptions } from '../models'
import { AYNI_FLOW_OUTCOMES, type AyniFlowOutcome } from '../types'
import { AYNI_FLOW_CLOSE_TYPE } from './AyniFlowProtocol'

export interface AyniFlowCloseMessageOptions {
  id?: string
  /** The flow id (the `@id` of the `open`), carried as `~thread.thid`. */
  flowId: string
  outcome: AyniFlowOutcome
  /** A human-readable sentence for `failed` and `cancelled`; `null` on the wire otherwise. */
  reason?: string | null
  references?: AyniFlowReferenceOptions[]
}

/** `ayni-flow/1.0/close` (profile §5.1), sent by either party; the first close wins. */
export class AyniFlowCloseMessage extends DidCommMessage {
  public constructor(options: AyniFlowCloseMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.setThread({ threadId: options.flowId })
      this.outcome = options.outcome
      this.reason = options.reason ?? null
      this.references = options.references?.map((reference) => new AyniFlowReference(reference))
    }
  }

  public static readonly type = parseMessageType(AYNI_FLOW_CLOSE_TYPE)
  @IsValidMessageType(AyniFlowCloseMessage.type)
  public readonly type = AyniFlowCloseMessage.type.messageTypeUri

  @IsIn(AYNI_FLOW_OUTCOMES)
  public outcome!: AyniFlowOutcome

  @IsOptional()
  @IsString()
  public reason: string | null = null

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AyniFlowReference)
  public references?: AyniFlowReference[]

  /** The flow this close ends: `~thread.thid`. */
  public get flowId(): string {
    return this.threadId
  }
}
