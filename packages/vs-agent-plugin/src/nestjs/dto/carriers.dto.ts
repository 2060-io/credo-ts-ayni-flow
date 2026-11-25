import { ApiProperty, ApiPropertyOptional, getSchemaPath } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
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

export class AuthorizeApproverDto {
  @ApiPropertyOptional({ description: 'A person, by name; or give a label', example: 'Jonas Weber' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string

  @ApiPropertyOptional({
    description: 'A role or a department, as the service words it; or give a name',
    example: 'Finance',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string

  @ApiProperty({ description: 'Whether this approver must approve, as it is when the request is sent' })
  @IsBoolean()
  required!: boolean
}

export class AuthorizeApprovalsDto {
  @ApiProperty({ description: 'The approvals needed in total', example: 2 })
  @IsInt()
  @Min(1)
  threshold!: number

  @ApiProperty({
    description: 'true when the person decides their own request, their confirmation counting as one of the approvals',
  })
  @IsBoolean()
  own!: boolean

  @ApiProperty({ type: [AuthorizeApproverDto], description: 'The other approvers asked' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuthorizeApproverDto)
  others!: AuthorizeApproverDto[]
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

  @ApiPropertyOptional({
    type: AuthorizeApprovalsDto,
    description:
      'When the request is one of several decisions: the approvals needed and the other approvers (FLOW-AUTH-004)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AuthorizeApprovalsDto)
  approvals?: AuthorizeApprovalsDto
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

  @ApiPropertyOptional({
    description: 'What the session is for; ag-ui when absent. One the last peer-status of the agent lists as open',
    example: 'ag-ui',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  endpoint?: string

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

/**
 * The credential asked for again: with the reason `restore`, `credentialId`, `schemaId`, `credDefId` and `issuedAt`
 * from the backup; with the reason `missing`, `jsonSchemaCredentialId` alone. The module checks them against the reason.
 */
export class ReissueReferenceDto {
  @ApiPropertyOptional({ description: 'Reason restore' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  credentialId?: string

  @ApiPropertyOptional({ description: 'Reason restore' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  schemaId?: string

  @ApiPropertyOptional({ description: 'Reason restore' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  credDefId?: string

  @ApiPropertyOptional({ description: 'Reason restore; ISO 8601' })
  @IsOptional()
  @IsISO8601()
  issuedAt?: string

  @ApiPropertyOptional({
    description:
      'Reason missing: the JSON schema credential of the schema, one the last peer status of the issuer lists in issuable',
    example: 'https://ecs.example/vt/schemas-badge-jsc.json',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  jsonSchemaCredentialId?: string
}

export class ReissueRequestDto {
  @ApiProperty({ type: ReissueReferenceDto })
  @ValidateNested()
  @Type(() => ReissueReferenceDto)
  reference!: ReissueReferenceDto

  @ApiProperty({
    enum: ['restore', 'missing'],
    description:
      'restore: after a restore, for a credential the backup names; missing: the wallet holds no credential of a schema the issuer lists in issuable',
    example: 'restore',
  })
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

// ---- peer-status/1.0 (profile §4.1) -------------------------------------------------------------

export class PeerStatusCredentialDto {
  @ApiProperty({ example: 'https://ecs.example/vt/schemas-badge-jsc.json' })
  @IsString()
  @IsNotEmpty()
  jsonSchemaCredentialId!: string
}

/** One method this agent accepts; the Admin API takes and gives it in camelCase. */
export class PeerStatusMethodDto {
  @ApiProperty({ enum: ['credential', 'email', 'document', 'face-match', 'authenticator-app', 'passkey'] })
  @IsString()
  @IsNotEmpty()
  type!: string

  @ApiPropertyOptional({ type: PeerStatusCredentialDto, description: 'A credential method only: the schema asked for' })
  credential?: PeerStatusCredentialDto

  @ApiPropertyOptional({
    type: [String],
    example: ['org:EE:12345678'],
    description:
      'A credential method only: the organizations whose credentials this agent accepts, by organization key; absent when any accredited issuer of the schema is accepted',
  })
  issuers?: string[]
}

export class PeerStatusObtainDto {
  @ApiPropertyOptional({ description: "How the peer obtains what it lacks to authenticate, in this agent's words" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  text?: string

  @ApiPropertyOptional({ description: 'An https link where it is obtained' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  url?: string
}

export class PeerStatusAuthenticationDto {
  @ApiProperty({ enum: ['none', 'optional', 'required'] })
  @IsIn(['none', 'optional', 'required'])
  rule!: 'none' | 'optional' | 'required'

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: { $ref: getSchemaPath(PeerStatusMethodDto) },
    description:
      'The methods this agent accepts, by the name it gives each; absent with the rule none. The module checks each method against the profile (§4.1)',
    example: {
      badge: {
        type: 'credential',
        credential: { jsonSchemaCredentialId: 'https://ecs.example/vt/schemas-badge-jsc.json' },
      },
      email: { type: 'email' },
      face: { type: 'face-match' },
    },
  })
  @IsOptional()
  @IsObject()
  methods?: Record<string, PeerStatusMethodDto>

  @ApiPropertyOptional({
    type: 'array',
    items: { type: 'array', items: { type: 'string' } },
    example: [['badge'], ['email', 'face']],
    description: 'The accepted combinations, each a list of method names; absent with the rule none',
  })
  @IsOptional()
  @IsArray()
  @IsArray({ each: true })
  combinations?: string[][]

  @ApiPropertyOptional({
    type: PeerStatusObtainDto,
    description: 'How the peer obtains what it lacks to authenticate',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusObtainDto)
  obtain?: PeerStatusObtainDto

  @ApiPropertyOptional({
    type: [String],
    enum: ['authenticator-app', 'passkey'],
    description: 'The types the peer may enrol with this agent; to an identified peer only',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enrol?: string[]

  @ApiPropertyOptional({
    type: [String],
    enum: ['authenticator-app', 'passkey'],
    description: 'The types the peer enrolled with this agent; to an identified peer only',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enrolled?: string[]
}

export class PeerStatusRefusalDto {
  @ApiProperty({ enum: ['untrusted', 'not-admitted', 'authentication-declined', 'authentication-unanswered'] })
  @IsString()
  @IsNotEmpty()
  code!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string
}

/** A credential this agent issues again to the peer when the peer holds none (profile §4.1 issuable, §6.11). */
export class PeerStatusIssuableDto {
  @ApiProperty({ example: 'https://ecs.example/vt/schemas-badge-jsc.json' })
  @IsString()
  @IsNotEmpty()
  jsonSchemaCredentialId!: string

  @ApiProperty({ description: 'The name a person reads', example: 'Acme badge' })
  @IsString()
  @IsNotEmpty()
  label!: string
}

export class PeerStatusDto {
  @ApiProperty({ type: PeerStatusAuthenticationDto })
  @ValidateNested()
  @Type(() => PeerStatusAuthenticationDto)
  authentication!: PeerStatusAuthenticationDto

  @ApiProperty({ description: 'Whether this agent holds a valid identity for the peer' })
  @IsBoolean()
  identified!: boolean

  @ApiProperty({ type: [String], example: ['ag-ui'], description: 'What the peer may use on the connection now' })
  @IsArray()
  @IsString({ each: true })
  open!: string[]

  @ApiPropertyOptional({
    type: [PeerStatusIssuableDto],
    description:
      'The credentials this agent issues again to the peer when it holds none (a reissue with the reason missing), each by the JSON schema credential of its schema and its name; to an identified peer only, absent when there is none',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeerStatusIssuableDto)
  issuable?: PeerStatusIssuableDto[]

  @ApiPropertyOptional({ type: PeerStatusRefusalDto, description: 'Present when this agent does not serve the peer' })
  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusRefusalDto)
  refusal?: PeerStatusRefusalDto
}

export class SendPeerStatusBodyDto {
  @ApiProperty({ description: 'Connection to tell', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string

  @ApiProperty({ type: PeerStatusDto })
  @ValidateNested()
  @Type(() => PeerStatusDto)
  status!: PeerStatusDto
}

export class QueryPeerStatusBodyDto {
  @ApiProperty({ description: 'Connection to ask', example: 'conn-1234-5678' })
  @IsString()
  @IsNotEmpty()
  connectionId!: string
}

/** The statuses of a connection: the last this agent sent and the last it received. */
export class PeerStatusRecordDto {
  @ApiProperty()
  connectionId!: string

  @ApiPropertyOptional({ type: PeerStatusDto })
  sent?: PeerStatusDto

  @ApiPropertyOptional()
  sentAt?: string

  @ApiPropertyOptional({ type: PeerStatusDto })
  received?: PeerStatusDto

  @ApiPropertyOptional()
  receivedAt?: string
}
