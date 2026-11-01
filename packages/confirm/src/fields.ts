import { DateTransformer } from '@credo-ts/core'
import { IsDate, IsIn } from 'class-validator'

export const ATTESTATION_METHODS = ['biometric', 'passcode', 'none'] as const
export type AttestationMethod = (typeof ATTESTATION_METHODS)[number]

/** The `request` body of confirm/1.0 (profile §6.6, FLOW-CONFIRM-001): a yes-or-no with a code the service also shows elsewhere. */
export interface ConfirmRequest {
  text: string
  code: string
  /** `true` asks for a device-authenticated answer. */
  attested: boolean
}

/** How the person authenticated on the device; `none` is allowed only when `attested` was false. */
export interface Attestation {
  method: AttestationMethod
  /** ISO 8601 */
  at: string
}

/** The `response` body of confirm/1.0. */
export interface ConfirmResponse {
  confirmed: boolean
  attestation: Attestation
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
