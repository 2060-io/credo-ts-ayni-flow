import { Expose, Type } from 'class-transformer'
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator'

/** How the notifier identifies the receiver (profile §4.1): nothing asked, a credential it may present, one it must. */
export const PEER_STATUS_RULES = ['none', 'optional', 'required'] as const
export type PeerStatusRule = (typeof PEER_STATUS_RULES)[number]

/** Why a notifier does not serve a receiver (profile §4.1). A receiver accepts a code it does not know. */
export const PEER_STATUS_REFUSAL_CODES = [
  'untrusted',
  'not-admitted',
  'authentication-declined',
  'authentication-unanswered',
] as const
export type PeerStatusRefusalCode = (typeof PEER_STATUS_REFUSAL_CODES)[number]

/** What a status may list as open in this version: the conversation channel. `a2a` and `chat` are reserved. */
export const PEER_STATUS_OPEN_AG_UI = 'ag-ui'

/** The credential that identifies the receiver, by the JSON schema credential of its schema. */
export interface PeerStatusCredential {
  jsonSchemaCredentialId: string
}

/** How the receiver obtains a credential the notifier accepts, in the notifier's words; a link when there is one. */
export interface PeerStatusObtain {
  text?: string
  url?: string
}

export interface PeerStatusAuthentication {
  rule: PeerStatusRule
  /** Present with `optional` and `required`, absent with `none`. */
  credential?: PeerStatusCredential
  /**
   * The organizations whose credentials the notifier accepts, by organization key; absent when any accredited
   * issuer of the schema is accepted. Absent with `none`.
   */
  issuers?: string[]
  /** Absent when the notifier says nothing of it, and with `none`. */
  obtain?: PeerStatusObtain
}

export interface PeerStatusRefusal {
  code: string
  comment?: string
}

/**
 * The body of `peer-status/1.0/status` (profile §4.1, FLOW-STAT-001): where the receiver stands with the notifier.
 * A status replaces the one before it.
 */
export interface PeerStatus {
  authentication: PeerStatusAuthentication
  /** Whether the notifier holds a valid identity for the receiver. */
  identified: boolean
  /** What the receiver may use on the connection now; empty when nothing is. */
  open: string[]
  /** Present when the notifier does not serve the receiver; `open` is then empty. */
  refusal?: PeerStatusRefusal
}

export class PeerStatusCredentialModel implements PeerStatusCredential {
  public constructor(options?: PeerStatusCredential) {
    if (options) this.jsonSchemaCredentialId = options.jsonSchemaCredentialId
  }

  @Expose({ name: 'json_schema_credential_id' })
  @IsString()
  public jsonSchemaCredentialId!: string
}

export class PeerStatusObtainModel implements PeerStatusObtain {
  public constructor(options?: PeerStatusObtain) {
    if (options) {
      if (options.text !== undefined) this.text = options.text
      if (options.url !== undefined) this.url = options.url
    }
  }

  @IsOptional()
  @IsString()
  public text?: string

  @IsOptional()
  @IsString()
  public url?: string
}

export class PeerStatusAuthenticationModel {
  public constructor(options?: PeerStatusAuthentication) {
    if (options) {
      this.rule = options.rule
      if (options.credential) this.credential = new PeerStatusCredentialModel(options.credential)
      if (options.issuers) this.issuers = [...options.issuers]
      if (options.obtain) this.obtain = new PeerStatusObtainModel(options.obtain)
    }
  }

  @IsIn(PEER_STATUS_RULES)
  public rule!: PeerStatusRule

  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusCredentialModel)
  public credential?: PeerStatusCredentialModel

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  public issuers?: string[]

  @IsOptional()
  @ValidateNested()
  @Type(() => PeerStatusObtainModel)
  public obtain?: PeerStatusObtainModel
}

export class PeerStatusRefusalModel implements PeerStatusRefusal {
  public constructor(options?: PeerStatusRefusal) {
    if (options) {
      this.code = options.code
      if (options.comment !== undefined) this.comment = options.comment
    }
  }

  @IsString()
  public code!: string

  @IsOptional()
  @IsString()
  public comment?: string
}
