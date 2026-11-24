import type { AuthenticateRecord, EnrolRecord } from '@ayni.org/credo-ts-didcomm-authenticate'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator'

import { CarrierRequestBaseDto } from './common.dto.js'

// ---- authenticate/1.0: the authentication (profile §6.14) ----------------------------------------

export class AuthenticateRequestDto {
  @ApiProperty({ enum: ['connection', 'visitor', 'step-up', 'admin', 'enrol'] })
  @IsIn(['connection', 'visitor', 'step-up', 'admin', 'enrol'])
  purpose!: 'connection' | 'visitor' | 'step-up' | 'admin' | 'enrol'

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description:
      'The methods, by the name this agent gives each, as in the peer status: { type, credential?: { jsonSchemaCredentialId }, issuers? }. The module checks them against the profile.',
    example: {
      badge: {
        type: 'credential',
        credential: { jsonSchemaCredentialId: 'https://ecs.example/vt/schemas-badge-jsc.json' },
      },
      email: { type: 'email' },
      face: { type: 'face-match' },
    },
  })
  @IsObject()
  methods!: Record<string, { type: string; credential?: { jsonSchemaCredentialId: string }; issuers?: string[] }>

  @ApiProperty({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['badge'], ['email', 'face']],
    description: 'The accepted combinations; for step-up and admin, the one set the action names',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsArray({ each: true })
  combinations!: string[][]

  @ApiPropertyOptional({
    description: 'What a step-up is for; required with step-up',
    example: "Confirm it's you to send 1 200 EUR",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string
}

export class SendAuthenticateBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: AuthenticateRequestDto })
  @ValidateNested()
  @Type(() => AuthenticateRequestDto)
  request!: AuthenticateRequestDto
}

export class ChooseCombinationBodyDto {
  @ApiProperty({
    type: [String],
    description:
      'The method names of the combination chosen: in answer to the request, or again after a step that ended consent-declined, then a combination that holds no declined method (awaitingChoice, declinedMethods)',
    example: ['email', 'face'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  combination!: string[]
}

export class AuthenticateStepDto {
  @ApiProperty({ description: "The step's id, the same in its answer and its result", example: '1' })
  @IsString()
  @IsNotEmpty()
  step!: string

  @ApiProperty({ description: 'The name of the method of the combination chosen', example: 'email' })
  @IsString()
  @IsNotEmpty()
  method!: string

  @ApiProperty({ enum: ['credential', 'email', 'document', 'face-match', 'authenticator-app', 'passkey'] })
  @IsString()
  @IsNotEmpty()
  type!: string

  @ApiPropertyOptional({ enum: ['address', 'code', 'consent', 'assertion'] })
  @IsOptional()
  @IsIn(['address', 'code', 'consent', 'assertion'])
  ask?: 'address' | 'code' | 'consent' | 'assertion'

  @ApiPropertyOptional({ description: 'face-match consent: the consent the person is asked for' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string

  @ApiPropertyOptional({ description: 'email code: until when the code is valid, ISO 8601' })
  @IsOptional()
  @IsString()
  expiresAt?: string

  @ApiPropertyOptional({ description: 'email and authenticator-app code: the tries left' })
  @IsOptional()
  @IsInt()
  @Min(0)
  triesLeft?: number

  @ApiPropertyOptional({ description: 'email code: the new codes the person may still ask for' })
  @IsOptional()
  @IsInt()
  @Min(0)
  newCodesLeft?: number

  @ApiPropertyOptional({ description: 'passkey assertion: the challenge, base64url' })
  @IsOptional()
  @IsString()
  challenge?: string

  @ApiPropertyOptional({ description: "passkey assertion: the relying party, the network's app-link domain" })
  @IsOptional()
  @IsString()
  rpId?: string

  @ApiPropertyOptional({ enum: ['wrong-code', 'new-code-refused'] })
  @IsOptional()
  @IsIn(['wrong-code', 'new-code-refused'])
  error?: 'wrong-code' | 'new-code-refused'

  @ApiPropertyOptional({ enum: ['too-soon', 'no-more'], description: 'With new-code-refused: why' })
  @IsOptional()
  @IsIn(['too-soon', 'no-more'])
  reason?: 'too-soon' | 'no-more'
}

export class SendStepBodyDto {
  @ApiProperty({ type: AuthenticateStepDto })
  @ValidateNested()
  @Type(() => AuthenticateStepDto)
  step!: AuthenticateStepDto
}

export class PasskeyAssertionDto {
  @ApiProperty()
  @IsString()
  id!: string

  @ApiProperty({ description: 'base64url' })
  @IsString()
  clientDataJson!: string

  @ApiProperty({ description: 'base64url' })
  @IsString()
  authenticatorData!: string

  @ApiProperty({ description: 'base64url' })
  @IsString()
  signature!: string

  @ApiProperty({ nullable: true, type: String, description: 'base64url' })
  @IsOptional()
  @IsString()
  userHandle!: string | null
}

export class AuthenticateAnswerDto {
  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  step!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string

  @ApiPropertyOptional({ description: "The phone's locale, with the address" })
  @IsOptional()
  @IsString()
  locale?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  code?: string

  @ApiPropertyOptional({ description: 'Asks for a new email code' })
  @IsOptional()
  @IsBoolean()
  newCode?: boolean

  @ApiPropertyOptional({
    description:
      'face-match consent: true on the person agreement, false when the person declines (the service then ends the step failed consent-declined)',
  })
  @IsOptional()
  @IsBoolean()
  consent?: boolean

  @ApiPropertyOptional({ type: PasskeyAssertionDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PasskeyAssertionDto)
  assertion?: PasskeyAssertionDto
}

export class AnswerStepBodyDto {
  @ApiProperty({ type: AuthenticateAnswerDto })
  @ValidateNested()
  @Type(() => AuthenticateAnswerDto)
  answer!: AuthenticateAnswerDto
}

export class AuthenticateStepResultDto {
  @ApiProperty({ example: '1' })
  @IsString()
  @IsNotEmpty()
  step!: string

  @ApiProperty({ enum: ['passed', 'failed', 'expired'] })
  @IsIn(['passed', 'failed', 'expired'])
  outcome!: 'passed' | 'failed' | 'expired'

  @ApiPropertyOptional({
    description:
      'A code of the flow profile §11, when the step did not pass; consent-declined (with failed) ends a face-match step whose consent the person declined, and only such a step',
    example: 'step-failed',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string
}

export class SendStepResultBodyDto {
  @ApiProperty({ type: AuthenticateStepResultDto })
  @ValidateNested()
  @Type(() => AuthenticateStepResultDto)
  result!: AuthenticateStepResultDto
}

/** One authentication as the Admin API returns it and as the webhook events carry it. */
export class AuthenticateExchangeDto {
  @ApiProperty({ description: 'The request id, thread of the exchange' })
  threadId!: string

  @ApiPropertyOptional({ description: 'The id of the authenticate flow' })
  flowId?: string

  @ApiProperty()
  connectionId!: string

  @ApiProperty({ description: 'requester (a service) or authenticator (a holder)' })
  role!: string

  @ApiProperty({
    description:
      'request-sent | request-received | choice-sent | choice-received | step-sent | step-received | answer-sent | answer-received | step-result-sent | step-result-received | failed',
  })
  state!: string

  @ApiProperty({ description: 'The request as sent or received' })
  request!: Record<string, unknown>

  @ApiPropertyOptional({
    type: [String],
    description:
      'The combination chosen, as the request lists it; after a declined consent and a new choice, the new one',
  })
  combination?: string[]

  @ApiProperty({
    description:
      'The steps announced for the combination, in order: { step, method, type, prompt (the last step message), answer?, result?, awaitingAnswer }',
  })
  steps!: Record<string, unknown>[]

  @ApiProperty({
    description:
      'The attempts before the current one, oldest first: { combination, steps }, the last step of each ended consent-declined. Empty until the person declines a consent and chooses again',
  })
  earlierAttempts!: Record<string, unknown>[]

  @ApiProperty({
    description:
      'Whether a choice is awaited: none was made yet, or the current step ended consent-declined. The five minutes of the choice run again from that step result',
  })
  awaitingChoice!: boolean

  @ApiProperty({
    type: [String],
    description: 'The methods whose consent the person declined: a new choice holds none of them',
  })
  declinedMethods!: string[]

  @ApiPropertyOptional({ description: 'With state failed: why (malformed, declined...)' })
  errorCode?: string

  @ApiPropertyOptional()
  errorDescription?: string

  @ApiProperty()
  createdAt!: string
}

export function toAuthenticateExchangeDto(record: AuthenticateRecord): AuthenticateExchangeDto {
  return {
    threadId: record.threadId,
    flowId: record.parentThreadId,
    connectionId: record.connectionId,
    role: record.role,
    state: record.state,
    request: record.request as unknown as Record<string, unknown>,
    combination: record.combination,
    steps: record.steps as unknown as Record<string, unknown>[],
    earlierAttempts: record.earlierAttempts as unknown as Record<string, unknown>[],
    awaitingChoice: record.awaitingChoice,
    declinedMethods: record.declinedMethods,
    errorCode: record.errorCode,
    errorDescription: record.errorDescription,
    createdAt: record.createdAt.toISOString(),
  }
}

// ---- authenticate/1.0: the enrolment (profile §6.4) -------------------------------------------------

export class SendEnrolRequestBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ enum: ['authenticator-app', 'passkey'] })
  @IsIn(['authenticator-app', 'passkey'])
  type!: 'authenticator-app' | 'passkey'
}

export class EnrolChallengeDto {
  @ApiProperty({ enum: ['authenticator-app', 'passkey'] })
  @IsIn(['authenticator-app', 'passkey'])
  type!: 'authenticator-app' | 'passkey'

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      "passkey: the creation options, { rp: { id }, user: { id, name, displayName }, challenge, pubKeyCredParams: [{ type, alg }], authenticatorSelection? }; the relying party is the network's app-link domain",
  })
  @IsOptional()
  @IsObject()
  publicKey?: {
    rp: { id: string; name?: string }
    user: { id: string; name: string; displayName: string }
    challenge: string
    pubKeyCredParams: { type: string; alg: number }[]
    authenticatorSelection?: { residentKey?: string; userVerification?: string }
  }

  @ApiPropertyOptional({ description: 'authenticator-app: the secret, base32. Sent once; not kept on the record' })
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({ description: 'authenticator-app: the otpauth:// link. Sent once; not kept on the record' })
  @IsOptional()
  @IsString()
  otpauthUri?: string

  @ApiPropertyOptional({ description: 'authenticator-app: 6' })
  @IsOptional()
  @IsInt()
  digits?: number

  @ApiPropertyOptional({ description: 'authenticator-app: 30' })
  @IsOptional()
  @IsInt()
  period?: number
}

export class SendEnrolChallengeBodyDto {
  @ApiProperty({ type: EnrolChallengeDto })
  @ValidateNested()
  @Type(() => EnrolChallengeDto)
  challenge!: EnrolChallengeDto
}

export class PasskeyAttestationDto {
  @ApiProperty()
  @IsString()
  id!: string

  @ApiProperty({ description: 'base64url' })
  @IsString()
  clientDataJson!: string

  @ApiProperty({ description: 'base64url' })
  @IsString()
  attestationObject!: string
}

export class EnrolAnswerDto {
  @ApiPropertyOptional({ type: PasskeyAttestationDto, description: 'passkey' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PasskeyAttestationDto)
  attestation?: PasskeyAttestationDto

  @ApiPropertyOptional({ description: 'authenticator-app: the six digits the app shows' })
  @IsOptional()
  @IsString()
  code?: string
}

export class AnswerEnrolBodyDto {
  @ApiProperty({ type: EnrolAnswerDto })
  @ValidateNested()
  @Type(() => EnrolAnswerDto)
  answer!: EnrolAnswerDto
}

export class UnenrolBodyDto {
  @ApiProperty({ description: 'Connection to the service', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string

  @ApiProperty({ enum: ['authenticator-app', 'passkey'] })
  @IsIn(['authenticator-app', 'passkey'])
  type!: 'authenticator-app' | 'passkey'
}

/** One enrolment as the Admin API returns it and as the webhook events carry it. */
export class EnrolExchangeDto {
  @ApiProperty({ description: 'The enrol-request id, thread of the exchange' })
  threadId!: string

  @ApiPropertyOptional({ description: 'The id of the enrol flow' })
  flowId?: string

  @ApiProperty()
  connectionId!: string

  @ApiProperty({ description: 'requester (a service) or authenticator (a holder)' })
  role!: string

  @ApiProperty({
    description:
      'request-sent | request-received | challenge-sent | challenge-received | answer-sent | answer-received | failed',
  })
  state!: string

  @ApiProperty({ enum: ['authenticator-app', 'passkey'] })
  type!: string

  @ApiPropertyOptional({
    description: "The last challenge; an authenticator app's secret and otpauthUri are not kept",
  })
  challenge?: Record<string, unknown>

  @ApiProperty({
    description:
      'How many challenges were sent or received; an authenticator app takes three codes in all, a fourth challenge is refused',
  })
  challenges!: number

  @ApiPropertyOptional({ description: 'The last answer' })
  answer?: Record<string, unknown>

  @ApiPropertyOptional()
  errorCode?: string

  @ApiPropertyOptional()
  errorDescription?: string

  @ApiProperty()
  createdAt!: string
}

export function toEnrolExchangeDto(record: EnrolRecord): EnrolExchangeDto {
  return {
    threadId: record.threadId,
    flowId: record.parentThreadId,
    connectionId: record.connectionId,
    role: record.role,
    state: record.state,
    type: record.enrolType,
    challenge: record.challenge as unknown as Record<string, unknown> | undefined,
    challenges: record.challenges,
    answer: record.answer as unknown as Record<string, unknown> | undefined,
    errorCode: record.errorCode,
    errorDescription: record.errorDescription,
    createdAt: record.createdAt.toISOString(),
  }
}
