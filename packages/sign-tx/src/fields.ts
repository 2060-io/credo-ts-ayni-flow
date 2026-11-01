import { Expose } from 'class-transformer'
import { IsString } from 'class-validator'

export const SIGN_TX_BROADCASTERS = ['service', 'app'] as const
export type SignTxBroadcaster = (typeof SIGN_TX_BROADCASTERS)[number]

export const SIGN_TX_STATUSES = ['signed', 'broadcast', 'failed'] as const
export type SignTxStatus = (typeof SIGN_TX_STATUSES)[number]

/** A Cosmos SDK `SignDoc` for `SIGN_MODE_DIRECT`, bytes base64-encoded (profile §6.9). */
export interface SignTxSignDoc {
  bodyBytes: string
  authInfoBytes: string
  accountNumber: string
}

/** The `request` body of sign-tx/1.0 (profile §6.9, FLOW-SIGN-001). */
export interface SignTxRequest {
  chainId: string
  signDoc: SignTxSignDoc
  /** What the service says the transaction does (`amount`, `to`, `memo`...); the holder checks it against the decoded body. */
  summary: Record<string, unknown>
  /** Who broadcasts: the service after the response, or the app before it. */
  broadcast: SignTxBroadcaster
}

export interface SignTxPublicKey {
  type: string
  value: string
}

/**
 * The `response` body of sign-tx/1.0. `signed`: the service broadcasts; `broadcast`: the app did, `tx_hash` is set;
 * `failed`: the chain refused (account number or sequence mismatch), `reason` says why.
 */
export interface SignTxResponse {
  signature?: string | null
  publicKey?: SignTxPublicKey | null
  txHash?: string | null
  status: SignTxStatus
  /** The chain's reason when `status` is `failed`. Not in the profile's example; added for the "answered failed with the chain's reason" rule. */
  reason?: string | null
}

export class SignTxSignDocModel implements SignTxSignDoc {
  public constructor(options?: SignTxSignDoc) {
    if (options) {
      this.bodyBytes = options.bodyBytes
      this.authInfoBytes = options.authInfoBytes
      this.accountNumber = options.accountNumber
    }
  }

  @Expose({ name: 'body_bytes' })
  @IsString()
  public bodyBytes!: string

  @Expose({ name: 'auth_info_bytes' })
  @IsString()
  public authInfoBytes!: string

  @Expose({ name: 'account_number' })
  @IsString()
  public accountNumber!: string
}

export class SignTxPublicKeyModel implements SignTxPublicKey {
  public constructor(options?: SignTxPublicKey) {
    if (options) {
      this.type = options.type
      this.value = options.value
    }
  }

  @IsString()
  public type!: string

  @IsString()
  public value!: string
}
