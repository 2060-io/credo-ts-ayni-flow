import type { AyniFlowRecord } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator'

export class FlowClientDto {
  @ApiProperty({ example: 'Firefox on Linux' })
  @IsString()
  description!: string

  @ApiProperty({ enum: ['web', 'ios', 'android'] })
  @IsIn(['web', 'ios', 'android'])
  platform!: 'web' | 'ios' | 'android'
}

export class FlowOriginDto {
  @ApiProperty({ enum: ['ag-ui', 'none'], description: 'ag-ui when a conversation triggered the flow' })
  @IsIn(['ag-ui', 'none'])
  channel!: 'ag-ui' | 'none'

  @ApiPropertyOptional({ example: 'did:webvh:...' })
  @IsOptional()
  @IsString()
  agentDid?: string

  @ApiPropertyOptional({ example: 's_8a1' })
  @IsOptional()
  @IsString()
  sessionId?: string

  @ApiPropertyOptional({ example: 'c_41' })
  @IsOptional()
  @IsString()
  conversationId?: string

  @ApiPropertyOptional({ type: FlowClientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FlowClientDto)
  client?: FlowClientDto
}

export class FlowStepDto {
  @ApiProperty()
  @IsString()
  id!: string

  @ApiProperty()
  @IsString()
  kind!: string

  @ApiProperty()
  @IsString()
  title!: string
}

export class FlowReferenceDto {
  @ApiProperty({ example: 'credential' })
  @IsString()
  type!: string

  @ApiProperty()
  @IsString()
  id!: string
}

export class OpenFlowBodyDto {
  @ApiProperty({ description: 'Connection to open the flow on', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string

  @ApiProperty({ description: 'A kind of the flow profile §6', example: 'authorize' })
  @IsString()
  @IsNotEmpty()
  kind!: string

  @ApiProperty({ description: 'What the person sees as the request title, in the service language' })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiPropertyOptional({ description: 'One sentence of context' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ type: FlowOriginDto })
  @ValidateNested()
  @Type(() => FlowOriginDto)
  origin!: FlowOriginDto

  @ApiProperty({
    description: 'After which both ends close the flow expired, ISO 8601',
    example: '2026-10-24T15:32:00Z',
  })
  @IsISO8601()
  expiresTime!: string

  @ApiPropertyOptional({ type: [String], example: ['device-authentication'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requires?: string[]

  @ApiPropertyOptional({ type: [FlowStepDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowStepDto)
  steps?: FlowStepDto[]
}

export class CloseFlowBodyDto {
  @ApiProperty({ enum: ['completed', 'declined', 'cancelled', 'failed', 'expired'] })
  @IsIn(['completed', 'declined', 'cancelled', 'failed', 'expired'])
  outcome!: 'completed' | 'declined' | 'cancelled' | 'failed' | 'expired'

  @ApiPropertyOptional({ description: 'A human-readable sentence for failed and cancelled' })
  @IsOptional()
  @IsString()
  reason?: string

  @ApiPropertyOptional({ type: [FlowReferenceDto], description: 'What the flow produced' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FlowReferenceDto)
  references?: FlowReferenceDto[]
}

export class FlowProblemReportBodyDto {
  @ApiProperty({ description: 'A code of the flow profile §11', example: 'not-eligible' })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiPropertyOptional({ description: 'The English sentence of description.en' })
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional({ description: 'The message the report is about (~thread.thid); defaults to the flow id' })
  @IsOptional()
  @IsString()
  threadId?: string
}

export class FlowDto {
  @ApiProperty({ description: 'The flow id, the @id of the open' })
  flowId!: string

  @ApiProperty()
  connectionId!: string

  @ApiProperty({ description: 'holder | service' })
  role!: string

  @ApiProperty({ description: 'Whether this agent opened the flow' })
  openedByMe!: boolean

  @ApiProperty({ description: 'pending | active | completed | declined | cancelled | failed | expired' })
  state!: string

  @ApiProperty()
  kind!: string

  @ApiProperty()
  title!: string

  @ApiPropertyOptional()
  description?: string

  @ApiProperty({ type: FlowOriginDto })
  @IsObject()
  origin!: FlowOriginDto

  @ApiProperty()
  expiresTime!: string

  @ApiPropertyOptional({ type: [String] })
  requires?: string[]

  @ApiPropertyOptional({ type: [FlowStepDto] })
  steps?: FlowStepDto[]

  @ApiPropertyOptional()
  reason?: string

  @ApiPropertyOptional({ type: [FlowReferenceDto] })
  references?: FlowReferenceDto[]

  @ApiPropertyOptional({ description: 'The problem-report code that failed the flow' })
  errorCode?: string

  @ApiPropertyOptional()
  closedAt?: string

  @ApiPropertyOptional({ description: 'me | peer | expiry' })
  closedBy?: string

  @ApiProperty()
  createdAt!: string
}

export function toFlowDto(record: AyniFlowRecord): FlowDto {
  return {
    flowId: record.flowId,
    connectionId: record.connectionId,
    role: record.role,
    openedByMe: record.openedByMe,
    state: record.state,
    kind: record.kind,
    title: record.title,
    description: record.description,
    origin: record.origin as FlowOriginDto,
    expiresTime: record.expiresTime.toISOString(),
    requires: record.requires,
    steps: record.steps,
    reason: record.reason,
    references: record.references,
    errorCode: record.errorCode,
    closedAt: record.closedAt?.toISOString(),
    closedBy: record.closedBy,
    createdAt: record.createdAt.toISOString(),
  }
}
