import { DateTransformer } from '@credo-ts/core'
import { Type } from 'class-transformer'
import { IsArray, IsBoolean, IsDate, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'

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

/**
 * Another approver asked for the same request (profile §6.5): a person by `name`, or a role or a department by `label`,
 * as the service words it; exactly one of the two. `required` as they are when the request is sent.
 */
export interface AuthorizeApprover {
  name?: string
  label?: string
  required: boolean
}

/**
 * Present when the request is one of several decisions (profile §6.5, FLOW-AUTH-004): `threshold`, the approvals needed
 * in total; `others`, the other approvers asked; `own: true` when the person decides their own request, their
 * confirmation counting as one of the approvals.
 */
export interface AuthorizeApprovals {
  threshold: number
  own: boolean
  others: AuthorizeApprover[]
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
  /** Optional: the other decisions the request needs (FLOW-AUTH-004). Absent from the wire when absent here. */
  approvals?: AuthorizeApprovals
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

export class AuthorizeApproverModel {
  public constructor(options?: AuthorizeApprover) {
    if (options) {
      if (options.name !== undefined) this.name = options.name
      if (options.label !== undefined) this.label = options.label
      this.required = options.required
    }
  }

  @IsOptional()
  @IsString()
  public name?: string

  @IsOptional()
  @IsString()
  public label?: string

  @IsBoolean()
  public required!: boolean

  public toApprover(): AuthorizeApprover {
    return {
      ...(this.name !== undefined ? { name: this.name } : {}),
      ...(this.label !== undefined ? { label: this.label } : {}),
      required: this.required,
    }
  }
}

export class AuthorizeApprovalsModel {
  public constructor(options?: AuthorizeApprovals) {
    if (options) {
      this.threshold = options.threshold
      this.own = options.own
      this.others = (options.others ?? []).map((other) => new AuthorizeApproverModel(other))
    }
  }

  @IsInt()
  public threshold!: number

  @IsBoolean()
  public own!: boolean

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AuthorizeApproverModel)
  public others!: AuthorizeApproverModel[]

  public toApprovals(): AuthorizeApprovals {
    return { threshold: this.threshold, own: this.own, others: this.others.map((other) => other.toApprover()) }
  }
}
