import { SignTxRole } from './types'

export interface SignTxModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `signer`; a Verifiable Service discloses `requester`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: SignTxRole[]
}

export class SignTxModuleConfig {
  private readonly options: SignTxModuleConfigOptions

  public constructor(options: SignTxModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('sign-tx: SignTxModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): SignTxRole[] {
    return this.options.roles
  }
}
