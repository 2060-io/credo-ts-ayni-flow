import { DateTransformer } from '@credo-ts/core'
import { Expose } from 'class-transformer'
import { IsDate, IsString } from 'class-validator'

/** The credential the holder asks to have reissued, from its backup's credential references (profile §6.11). */
export interface ReissueReference {
  credentialId: string
  schemaId: string
  credDefId: string
  /** ISO 8601 */
  issuedAt: string
}

/** The `request` body of reissue/1.0 (profile §6.11, FLOW-REISSUE-001). */
export interface ReissueRequest {
  reference: ReissueReference
  /** Why the holder asks: `restore` after a restore from backup. */
  reason: string
}

export class ReissueReferenceModel {
  public constructor(options?: ReissueReference) {
    if (options) {
      this.credentialId = options.credentialId
      this.schemaId = options.schemaId
      this.credDefId = options.credDefId
      this.issuedAt = new Date(options.issuedAt)
    }
  }

  @Expose({ name: 'credential_id' })
  @IsString()
  public credentialId!: string

  @Expose({ name: 'schema_id' })
  @IsString()
  public schemaId!: string

  @Expose({ name: 'cred_def_id' })
  @IsString()
  public credDefId!: string

  @Expose({ name: 'issued_at' })
  @IsDate()
  @DateTransformer()
  public issuedAt!: Date
}
