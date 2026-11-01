import { DateTransformer } from '@credo-ts/core'
import { DidCommMessage, IsValidMessageType, parseMessageType } from '@credo-ts/didcomm'
import { Expose, Type } from 'class-transformer'
import { IsArray, IsDate, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

import { AyniFlowOrigin, type AyniFlowOriginOptions, AyniFlowStep, type AyniFlowStepOptions } from '../models'
import { AYNI_FLOW_OPEN_TYPE } from './AyniFlowProtocol'

export interface AyniFlowOpenMessageOptions {
  id?: string
  kind: string
  title: string
  description?: string
  origin: AyniFlowOriginOptions
  expiresTime: Date
  requires?: string[]
  steps?: AyniFlowStepOptions[]
}

/**
 * `ayni-flow/1.0/open` (profile §5.1). Its `@id` is the flow id every message of the flow carries as `~thread.pthid`.
 *
 * `kind`, `title`, `origin` and `expires_time` are required by the profile; they are optional for the parser so that an
 * incomplete `open` reaches the service, which answers it with a `malformed` problem report (FLOW-CORE-002).
 */
export class AyniFlowOpenMessage extends DidCommMessage {
  public constructor(options: AyniFlowOpenMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.kind = options.kind
      this.title = options.title
      this.description = options.description
      this.origin = new AyniFlowOrigin(options.origin)
      this.expiresTime = options.expiresTime
      this.requires = options.requires
      this.steps = options.steps?.map((step) => new AyniFlowStep(step))
    }
  }

  public static readonly type = parseMessageType(AYNI_FLOW_OPEN_TYPE)
  @IsValidMessageType(AyniFlowOpenMessage.type)
  public readonly type = AyniFlowOpenMessage.type.messageTypeUri

  @IsOptional()
  @IsString()
  public kind?: string

  @IsOptional()
  @IsString()
  public title?: string

  @IsOptional()
  @IsString()
  public description?: string

  @IsOptional()
  @IsObject()
  @Type(() => AyniFlowOrigin)
  public origin?: AyniFlowOrigin

  @Expose({ name: 'expires_time' })
  @IsOptional()
  @IsDate()
  @DateTransformer()
  public expiresTime?: Date

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public requires?: string[]

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AyniFlowStep)
  public steps?: AyniFlowStep[]
}
