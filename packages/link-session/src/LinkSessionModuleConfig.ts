import { LinkSessionRole } from './types'

export interface LinkSessionModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `holder`; a Verifiable Service discloses `agent`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: LinkSessionRole[]
}

export class LinkSessionModuleConfig {
  private readonly options: LinkSessionModuleConfigOptions

  public constructor(options: LinkSessionModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('link-session: LinkSessionModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): LinkSessionRole[] {
    return this.options.roles
  }
}
