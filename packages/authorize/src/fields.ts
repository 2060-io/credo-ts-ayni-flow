import { DateTransformer } from '@credo-ts/core'
import { IsDate, IsIn, IsOptional, IsString } from 'class-validator'

export const ATTESTATION_METHODS = ['biometric', 'passcode', 'none'] as const
export type AttestationMethod = (typeof ATTESTATION_METHODS)[number]

export const AUTHORIZE_DECISIONS = ['approved', 'rejected'] as const
export type AuthorizeDecision = (typeof AUTHORIZE_DECISIONS)[number]

/** Who asks: the agent itself (the service asks the person) or the person whose request is to be approved (profile §6.5). */
export interface AuthorizeRequester {
  name: string
  role?: string | null
  did?: string | null
}

export interface AuthorizePurpose {
  id: string
  label: string
}

/** The `request` body of authorize/1.0 (profile §6.5, FLOW-AUTH-001). */
export interface AuthorizeRequest {
  requester: AuthorizeRequester
  purpose: AuthorizePurpose
  justification: string
  scope: string[]
  /** ISO 8601 */
  expiresAt: string
  /** `true` asks for a device-authenticated decision. */
  attested: boolean
}

/** How the person authenticated on the device for the decision; `none` is allowed only when `attested` was false. */
export interface Attestation {
  method: AttestationMethod
  /** ISO 8601 */
  at: string
}

/** The `response` body of authorize/1.0. */
export interface AuthorizeResponse {
  decision: AuthorizeDecision
  attestation: Attestation
  comment?: string | null
}

// ---- wire classes (class-validator / class-transformer) -----------------------------------------

export class AuthorizeRequesterModel implements AuthorizeRequester {
  public constructor(options?: AuthorizeRequester) {
    if (options) {
      this.name = options.name
      this.role = options.role ?? null
      this.did = options.did ?? null
    }
  }

  @IsString()
  public name!: string

  @IsOptional()
  @IsString()
  public role: string | null = null

  @IsOptional()
  @IsString()
  public did: string | null = null
}

export class AuthorizePurposeModel implements AuthorizePurpose {
  public constructor(options?: AuthorizePurpose) {
    if (options) {
      this.id = options.id
      this.label = options.label
    }
  }

  @IsString()
  public id!: string

  @IsString()
  public label!: string
}

export class AttestationModel {
  public constructor(options?: Attestation) {
    if (options) {
      this.method = options.method
      this.at = new Date(options.at)
    }
  }

  @IsIn(ATTESTATION_METHODS)
  public method!: AttestationMethod

  @IsDate()
  @DateTransformer()
  public at!: Date
}
