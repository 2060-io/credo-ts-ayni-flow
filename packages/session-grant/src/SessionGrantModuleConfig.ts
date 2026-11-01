import { SessionGrantRole } from './types'

export interface SessionGrantModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `agent`; a Verifiable Service discloses `requester`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: SessionGrantRole[]
}

export class SessionGrantModuleConfig {
  private readonly options: SessionGrantModuleConfigOptions

  public constructor(options: SessionGrantModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('session-grant: SessionGrantModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): SessionGrantRole[] {
    return this.options.roles
  }
}
