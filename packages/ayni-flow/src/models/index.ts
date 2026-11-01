import { Expose, Type } from 'class-transformer'
import { IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'

export const AYNI_FLOW_CLIENT_PLATFORMS = ['web', 'ios', 'android'] as const
export type AyniFlowClientPlatform = (typeof AYNI_FLOW_CLIENT_PLATFORMS)[number]

export const AYNI_FLOW_ORIGIN_CHANNELS = ['ag-ui', 'none'] as const
export type AyniFlowOriginChannel = (typeof AYNI_FLOW_ORIGIN_CHANNELS)[number]

export interface AyniFlowClientOptions {
  description: string
  platform: AyniFlowClientPlatform
}

/** The client description the agent recorded for the session that triggered the flow (profile §5.1 `origin.client`). */
export class AyniFlowClient {
  public constructor(options?: AyniFlowClientOptions) {
    if (options) {
      this.description = options.description
      this.platform = options.platform
    }
  }

  @IsString()
  public description!: string

  @IsIn(AYNI_FLOW_CLIENT_PLATFORMS)
  public platform!: AyniFlowClientPlatform
}

export interface AyniFlowOriginOptions {
  channel: AyniFlowOriginChannel
  agentDid?: string
  sessionId?: string
  conversationId?: string
  client?: AyniFlowClientOptions
}

/**
 * Where a flow comes from (profile §5.1): `{ channel: 'ag-ui', agentDid, sessionId, conversationId?, client }` when a
 * conversation triggered it, `{ channel: 'none' }` for the service's own process. Field names are camelCase on the wire.
 */
export class AyniFlowOrigin {
  public constructor(options?: AyniFlowOriginOptions) {
    if (options) {
      this.channel = options.channel
      this.agentDid = options.agentDid
      this.sessionId = options.sessionId
      this.conversationId = options.conversationId
      this.client = options.client ? new AyniFlowClient(options.client) : undefined
    }
  }

  @IsIn(AYNI_FLOW_ORIGIN_CHANNELS)
  public channel!: AyniFlowOriginChannel

  @Expose({ name: 'agentDid' })
  @IsOptional()
  @IsString()
  public agentDid?: string

  @Expose({ name: 'sessionId' })
  @IsOptional()
  @IsString()
  public sessionId?: string

  @Expose({ name: 'conversationId' })
  @IsOptional()
  @IsString()
  public conversationId?: string

  @IsOptional()
  @ValidateNested()
  @Type(() => AyniFlowClient)
  public client?: AyniFlowClient
}

export interface AyniFlowStepOptions {
  id: string
  kind: string
  title: string
}

/** One step of a flow that chains several exchanges (profile §5.1 `steps`). */
export class AyniFlowStep {
  public constructor(options?: AyniFlowStepOptions) {
    if (options) {
      this.id = options.id
      this.kind = options.kind
      this.title = options.title
    }
  }

  @IsString()
  public id!: string

  @IsString()
  public kind!: string

  @IsString()
  public title!: string
}

export interface AyniFlowReferenceOptions {
  type: string
  id: string
}

/** What a flow produced, pointed at by `close.references` (profile §5.1): a credential id, a session id, a transaction hash. */
export class AyniFlowReference {
  public constructor(options?: AyniFlowReferenceOptions) {
    if (options) {
      this.type = options.type
      this.id = options.id
    }
  }

  @IsString()
  public type!: string

  @IsString()
  public id!: string
}
