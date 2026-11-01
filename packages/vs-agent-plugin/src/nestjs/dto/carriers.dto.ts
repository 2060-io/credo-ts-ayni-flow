import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator'

import { AttestationDto, CarrierRequestBaseDto } from './common.dto.js'

// ---- authorize/1.0 (profile §6.5) --------------------------------------------------------------

export class AuthorizeRequesterDto {
  @ApiProperty({ example: 'Ana Ruiz' })
  @IsString()
  @IsNotEmpty()
  name!: string

  @ApiPropertyOptional({ example: 'Analyst' })
  @IsOptional()
  @IsString()
  role?: string | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  did?: string | null
}

export class AuthorizePurposeDto {
  @ApiProperty({ example: 'customer-support' })
  @IsString()
  @IsNotEmpty()
  id!: string

  @ApiProperty({ example: 'Customer support' })
  @IsString()
  @IsNotEmpty()
  label!: string
}

export class AuthorizeRequestDto {
  @ApiProperty({ type: AuthorizeRequesterDto })
  @ValidateNested()
  @Type(() => AuthorizeRequesterDto)
  requester!: AuthorizeRequesterDto

  @ApiProperty({ type: AuthorizePurposeDto })
  @ValidateNested()
  @Type(() => AuthorizePurposeDto)
  purpose!: AuthorizePurposeDto

  @ApiProperty({ example: 'Ticket 4411 needs the customer address.' })
  @IsString()
  justification!: string

  @ApiProperty({ type: [String], example: ['tool:crm.readCustomer'] })
  @IsArray()
  @IsString({ each: true })
  scope!: string[]

  @ApiProperty({ description: 'ISO 8601', example: '2026-10-24T18:00:00Z' })
  @IsISO8601()
  expiresAt!: string

  @ApiProperty({ description: 'Ask for a device-authenticated decision' })
  @IsBoolean()
  attested!: boolean
}

export class SendAuthorizeBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: AuthorizeRequestDto })
  @ValidateNested()
  @Type(() => AuthorizeRequestDto)
  request!: AuthorizeRequestDto
}

export class AuthorizeResponseDto {
  @ApiProperty({ enum: ['approved', 'rejected'] })
  @IsIn(['approved', 'rejected'])
  decision!: 'approved' | 'rejected'

  @ApiProperty({ type: AttestationDto })
  @ValidateNested()
  @Type(() => AttestationDto)
  attestation!: AttestationDto

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string | null
}

export class RespondAuthorizeBodyDto {
  @ApiProperty({ type: AuthorizeResponseDto })
  @ValidateNested()
  @Type(() => AuthorizeResponseDto)
  response!: AuthorizeResponseDto
}

// ---- confirm/1.0 (profile §6.6) ----------------------------------------------------------------

export class ConfirmRequestDto {
  @ApiProperty({ example: 'Confirm the change of your delivery address' })
  @IsString()
  @IsNotEmpty()
  text!: string

  @ApiProperty({ description: 'The code the service also shows elsewhere', example: '48 21' })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiProperty()
  @IsBoolean()
  attested!: boolean
}

export class SendConfirmBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: ConfirmRequestDto })
  @ValidateNested()
  @Type(() => ConfirmRequestDto)
  request!: ConfirmRequestDto
}

export class ConfirmResponseDto {
  @ApiProperty()
  @IsBoolean()
  confirmed!: boolean

  @ApiProperty({ type: AttestationDto })
  @ValidateNested()
  @Type(() => AttestationDto)
  attestation!: AttestationDto
}

export class RespondConfirmBodyDto {
  @ApiProperty({ type: ConfirmResponseDto })
  @ValidateNested()
  @Type(() => ConfirmResponseDto)
  response!: ConfirmResponseDto
}

// ---- link-session/1.0 (profile §6.7) -----------------------------------------------------------

export class LinkSessionAgentDto {
  @ApiProperty({ example: 'did:webvh:...' })
  @IsString()
  @IsNotEmpty()
  did!: string

  @ApiProperty({ example: 'Acme Support' })
  @IsString()
  @IsNotEmpty()
  name!: string
}

export class LinkSessionBrowserDto {
  @ApiProperty({ example: 'Firefox on Linux' })
  @IsString()
  @IsNotEmpty()
  description!: string

  @ApiProperty({ enum: ['web', 'ios', 'android'] })
  @IsIn(['web', 'ios', 'android'])
  platform!: 'web' | 'ios' | 'android'
}

export class LinkSessionRequestDto {
  @ApiProperty({ type: LinkSessionAgentDto })
  @ValidateNested()
  @Type(() => LinkSessionAgentDto)
  agent!: LinkSessionAgentDto

  @ApiProperty({ type: LinkSessionBrowserDto })
  @ValidateNested()
  @Type(() => LinkSessionBrowserDto)
  browser!: LinkSessionBrowserDto

  @ApiProperty({ example: 'https://ayni.acme.example' })
  @IsString()
  @IsNotEmpty()
  webOrigin!: string

  @ApiProperty({ description: 'ISO 8601', example: '2026-10-24T15:20:41Z' })
  @IsISO8601()
  startedAt!: string

  @ApiProperty({ description: 'The out-of-band invitation @id the holder accepted or reused' })
  @IsString()
  @IsNotEmpty()
  invitationId!: string

  @ApiPropertyOptional({ type: [String], description: 'Three distinct codes for a known-device re-link, else absent' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  codes?: string[] | null
}

export class SendLinkSessionBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: LinkSessionRequestDto })
  @ValidateNested()
  @Type(() => LinkSessionRequestDto)
  request!: LinkSessionRequestDto
}

export class LinkSessionResponseDto {
  @ApiProperty()
  @IsBoolean()
  link!: boolean

  @ApiPropertyOptional({ description: 'The picked code when the request carried codes' })
  @IsOptional()
  @IsString()
  code?: string | null
}

export class RespondLinkSessionBodyDto {
  @ApiProperty({ type: LinkSessionResponseDto })
  @ValidateNested()
  @Type(() => LinkSessionResponseDto)
  response!: LinkSessionResponseDto
}

// ---- session-grant/1.0 (profile §6.8) ----------------------------------------------------------

export class SessionGrantClientDto {
  @ApiProperty({ example: 'Ayni on iPhone' })
  @IsString()
  @IsNotEmpty()
  description!: string

  @ApiProperty({ enum: ['web', 'ios', 'android'] })
  @IsIn(['web', 'ios', 'android'])
  platform!: 'web' | 'ios' | 'android'

  @ApiProperty({ example: '1.0.0' })
  @IsString()
  appVersion!: string
}

export class SessionGrantRequestDto {
  @ApiProperty({ example: 'did:webvh:...' })
  @IsString()
  @IsNotEmpty()
  agentDid!: string

  @ApiPropertyOptional({ description: 'The conversation to resume, or null' })
  @IsOptional()
  @IsString()
  conversationId?: string | null

  @ApiProperty()
  @IsBoolean()
  newConversation!: boolean

  @ApiProperty({ type: SessionGrantClientDto })
  @ValidateNested()
  @Type(() => SessionGrantClientDto)
  client!: SessionGrantClientDto
}

export class SendSessionGrantRequestBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: SessionGrantRequestDto })
  @ValidateNested()
  @Type(() => SessionGrantRequestDto)
  request!: SessionGrantRequestDto
}

export class SessionGrantGrantDto {
  @ApiProperty({ description: 'Opaque, single use' })
  @IsString()
  @IsNotEmpty()
  grant!: string

  @ApiProperty({ example: 'https://agent.acme.example/ayni/sessions' })
  @IsString()
  @IsNotEmpty()
  sessionsUrl!: string

  @ApiProperty({ description: 'At most sixty seconds away, ISO 8601' })
  @IsISO8601()
  expiresAt!: string
}

export class GrantSessionBodyDto {
  @ApiProperty({ type: SessionGrantGrantDto })
  @ValidateNested()
  @Type(() => SessionGrantGrantDto)
  grant!: SessionGrantGrantDto
}

// ---- sign-tx/1.0 (profile §6.9) ----------------------------------------------------------------

export class SignDocDto {
  @ApiProperty({ description: 'base64' })
  @IsString()
  @IsNotEmpty()
  bodyBytes!: string

  @ApiProperty({ description: 'base64' })
  @IsString()
  @IsNotEmpty()
  authInfoBytes!: string

  @ApiProperty({ example: '1203' })
  @IsString()
  @IsNotEmpty()
  accountNumber!: string
}

export class SignTxRequestDto {
  @ApiProperty({ example: 'vna-testnet-1' })
  @IsString()
  @IsNotEmpty()
  chainId!: string

  @ApiProperty({ type: SignDocDto })
  @ValidateNested()
  @Type(() => SignDocDto)
  signDoc!: SignDocDto

  @ApiProperty({
    description: 'What the transaction does, as the holder will check it against the body',
    example: { amount: '150000 uvna', to: 'verana1...', memo: 'Order 8812' },
  })
  @IsObject()
  summary!: Record<string, unknown>

  @ApiProperty({ enum: ['service', 'app'], description: 'Who broadcasts' })
  @IsIn(['service', 'app'])
  broadcast!: 'service' | 'app'
}

export class SendSignTxBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: SignTxRequestDto })
  @ValidateNested()
  @Type(() => SignTxRequestDto)
  request!: SignTxRequestDto
}

export class SignTxPublicKeyDto {
  @ApiProperty({ example: 'secp256k1' })
  @IsString()
  type!: string

  @ApiProperty({ description: 'base64' })
  @IsString()
  value!: string
}

export class SignTxResponseDto {
  @ApiProperty({ enum: ['signed', 'broadcast', 'failed'] })
  @IsIn(['signed', 'broadcast', 'failed'])
  status!: 'signed' | 'broadcast' | 'failed'

  @ApiPropertyOptional({ description: 'base64' })
  @IsOptional()
  @IsString()
  signature?: string | null

  @ApiPropertyOptional({ type: SignTxPublicKeyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SignTxPublicKeyDto)
  publicKey?: SignTxPublicKeyDto | null

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  txHash?: string | null

  @ApiPropertyOptional({ description: "The chain's reason when status is failed" })
  @IsOptional()
  @IsString()
  reason?: string | null
}

export class RespondSignTxBodyDto {
  @ApiProperty({ type: SignTxResponseDto })
  @ValidateNested()
  @Type(() => SignTxResponseDto)
  response!: SignTxResponseDto
}

// ---- notify/1.0 (profile §6.10) ----------------------------------------------------------------

export class NotificationDto {
  @ApiProperty({ example: 'c_41' })
  @IsString()
  @IsNotEmpty()
  conversationId!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sessionId?: string | null

  @ApiProperty({ example: 'Acme Support replied' })
  @IsString()
  @IsNotEmpty()
  title!: string

  @ApiPropertyOptional({ example: 'Your ticket is solved.' })
  @IsOptional()
  @IsString()
  preview?: string | null

  @ApiProperty({ description: 'Notifications with the same key are grouped on the phone', example: 'c_41' })
  @IsString()
  @IsNotEmpty()
  collapseKey!: string

  @ApiProperty({ enum: ['normal', 'low'] })
  @IsIn(['normal', 'low'])
  priority!: 'normal' | 'low'
}

export class SendNotificationBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: NotificationDto })
  @ValidateNested()
  @Type(() => NotificationDto)
  notification!: NotificationDto
}

// ---- reissue/1.0 (profile §6.11) ---------------------------------------------------------------

export class ReissueReferenceDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  credentialId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  schemaId!: string

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  credDefId!: string

  @ApiProperty({ description: 'ISO 8601' })
  @IsISO8601()
  issuedAt!: string
}

export class ReissueRequestDto {
  @ApiProperty({ type: ReissueReferenceDto })
  @ValidateNested()
  @Type(() => ReissueReferenceDto)
  reference!: ReissueReferenceDto

  @ApiProperty({ example: 'restore' })
  @IsString()
  @IsNotEmpty()
  reason!: string
}

export class SendReissueBodyDto extends CarrierRequestBaseDto {
  @ApiProperty({ type: ReissueRequestDto })
  @ValidateNested()
  @Type(() => ReissueRequestDto)
  request!: ReissueRequestDto
}

// ---- revocation_notification/2.0 (profile §6.12, CC-VSA-007) -----------------------------------

export class SendRevocationNotificationBodyDto {
  @ApiProperty({ description: 'Connection of the holder', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string

  @ApiProperty({
    description:
      'The revocation id of the credential: <revocation registry id>::<credential revocation index> for AnonCreds',
  })
  @IsString()
  @IsNotEmpty()
  revocationId!: string

  @ApiPropertyOptional({ description: 'Defaults to anoncreds', example: 'anoncreds' })
  @IsOptional()
  @IsString()
  revocationFormat?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string
}

export class FailExchangeBodyDto {
  @ApiProperty({ description: 'Why the exchange failed, a code of the flow profile §11', example: 'declined' })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string
}
