import { DateTransformer } from '@credo-ts/core'
import { Expose } from 'class-transformer'
import { IsDate, IsOptional, IsString } from 'class-validator'

/**
 * Why the holder asks (profile §6.11): `restore` after a restore from backup, for a credential its backup names;
 * `missing` when its wallet holds no credential of a schema the issuer lists in the peer status's `issuable` (§4.1).
 */
export const REISSUE_REASONS = ['restore', 'missing'] as const
export type ReissueReason = (typeof REISSUE_REASONS)[number]

/**
 * The credential the holder asks to have reissued (profile §6.11). With the reason `restore`: `credentialId`,
 * `schemaId`, `credDefId` and `issuedAt`, from its backup's credential references. With the reason `missing`:
 * `jsonSchemaCredentialId` alone, the holder holding no credential to name.
 */
export interface ReissueReference {
  credentialId?: string
  schemaId?: string
  credDefId?: string
  /** ISO 8601 */
  issuedAt?: string
  /** The JSON schema credential of the credential's schema, as the peer status lists it in `issuable`. */
  jsonSchemaCredentialId?: string
}

/** The `request` body of reissue/1.0 (profile §6.11, FLOW-REISSUE-001). */
export interface ReissueRequest {
  reference: ReissueReference
  /** Why the holder asks: `restore` or `missing` (`REISSUE_REASONS`). */
  reason: ReissueReason | string
}

export class ReissueReferenceModel {
  public constructor(options?: ReissueReference) {
    if (options) {
      if (options.credentialId !== undefined) this.credentialId = options.credentialId
      if (options.schemaId !== undefined) this.schemaId = options.schemaId
      if (options.credDefId !== undefined) this.credDefId = options.credDefId
      if (options.issuedAt !== undefined) this.issuedAt = new Date(options.issuedAt)
      if (options.jsonSchemaCredentialId !== undefined) this.jsonSchemaCredentialId = options.jsonSchemaCredentialId
    }
  }

  @Expose({ name: 'credential_id' })
  @IsOptional()
  @IsString()
  public credentialId?: string

  @Expose({ name: 'schema_id' })
  @IsOptional()
  @IsString()
  public schemaId?: string

  @Expose({ name: 'cred_def_id' })
  @IsOptional()
  @IsString()
  public credDefId?: string

  @Expose({ name: 'issued_at' })
  @IsOptional()
  @IsDate()
  @DateTransformer()
  public issuedAt?: Date

  @Expose({ name: 'json_schema_credential_id' })
  @IsOptional()
  @IsString()
  public jsonSchemaCredentialId?: string

  /** The reference of the API, with the fields that travelled. */
  public toReference(): ReissueReference {
    return {
      ...(this.credentialId !== undefined ? { credentialId: this.credentialId } : {}),
      ...(this.schemaId !== undefined ? { schemaId: this.schemaId } : {}),
      ...(this.credDefId !== undefined ? { credDefId: this.credDefId } : {}),
      ...(this.issuedAt !== undefined ? { issuedAt: this.issuedAt.toISOString() } : {}),
      ...(this.jsonSchemaCredentialId !== undefined ? { jsonSchemaCredentialId: this.jsonSchemaCredentialId } : {}),
    }
  }
}
