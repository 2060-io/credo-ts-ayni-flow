import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator'

export class SentMessageDto {
  @ApiProperty({ description: 'Identifier of the sent message', example: 'a1b2c3d4-5678-90ab-cdef-1234567890ab' })
  id!: string
}

/** Fields every carrier `request` body shares. */
export class CarrierRequestBaseDto {
  @ApiProperty({ description: 'Connection to send the request on', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string

  @ApiPropertyOptional({
    description: 'The flow the request runs inside (the id of the ayni-flow open), set as ~thread.pthid',
    example: 'f1ow-7c2e',
  })
  @IsOptional()
  @IsString()
  flowId?: string
}

export class AttestationDto {
  @ApiProperty({ enum: ['biometric', 'passcode', 'none'] })
  @IsString()
  method!: 'biometric' | 'passcode' | 'none'

  @ApiProperty({ description: 'When the person authenticated, ISO 8601', example: '2026-10-24T15:21:03Z' })
  @IsISO8601()
  at!: string
}

/** One carrier exchange as the Admin API returns it and as the webhook events carry it. */
export class CarrierExchangeDto {
  @ApiProperty({ description: 'The request id, thread of the exchange' })
  threadId!: string

  @ApiPropertyOptional({ description: 'The flow id when the exchange runs inside an ayni-flow' })
  flowId?: string

  @ApiProperty()
  connectionId!: string

  @ApiProperty({ description: 'The role this agent plays in the exchange' })
  role!: string

  @ApiProperty({
    description: 'request-sent | request-received | response-sent | response-received | answered | failed',
  })
  state!: string

  @ApiProperty({ description: 'The request body as sent or received' })
  request!: Record<string, unknown>

  @ApiPropertyOptional({ description: 'The response body as sent or received' })
  response?: Record<string, unknown>

  @ApiPropertyOptional({ description: 'With state failed: why (malformed, declined, ...)' })
  errorCode?: string

  @ApiPropertyOptional()
  errorDescription?: string

  @ApiProperty()
  createdAt!: string
}

interface CarrierRecordLike {
  threadId: string
  parentThreadId?: string
  connectionId: string
  role: string
  state: string
  request: unknown
  response?: unknown
  errorCode?: string
  errorDescription?: string
  createdAt: Date
}

export function toCarrierExchangeDto(record: CarrierRecordLike): CarrierExchangeDto {
  return {
    threadId: record.threadId,
    flowId: record.parentThreadId,
    connectionId: record.connectionId,
    role: record.role,
    state: record.state,
    request: record.request as Record<string, unknown>,
    response: record.response as Record<string, unknown> | undefined,
    errorCode: record.errorCode,
    errorDescription: record.errorDescription,
    createdAt: record.createdAt.toISOString(),
  }
}
