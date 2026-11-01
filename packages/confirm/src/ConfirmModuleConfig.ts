import { ConfirmRole } from './types'

export interface ConfirmModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `confirmer`; a Verifiable Service discloses `requester`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: ConfirmRole[]
}

export class ConfirmModuleConfig {
  private readonly options: ConfirmModuleConfigOptions

  public constructor(options: ConfirmModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('confirm: ConfirmModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): ConfirmRole[] {
    return this.options.roles
  }
}
