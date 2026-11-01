import { ReissueRole } from './types'

export interface ReissueModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `issuer`; a Verifiable Service discloses `requester`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: ReissueRole[]
}

export class ReissueModuleConfig {
  private readonly options: ReissueModuleConfigOptions

  public constructor(options: ReissueModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('reissue: ReissueModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): ReissueRole[] {
    return this.options.roles
  }
}
