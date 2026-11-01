import { AuthorizeRole } from './types'

export interface AuthorizeModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `approver`; a Verifiable Service discloses `requester`. A service may NOT open a kind whose
   * carrier protocol the holder did not disclose (FLOW-CAP-003), so disclose only what you implement.
   */
  roles: AuthorizeRole[]
}

export class AuthorizeModuleConfig {
  private readonly options: AuthorizeModuleConfigOptions

  public constructor(options: AuthorizeModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('authorize: AuthorizeModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): AuthorizeRole[] {
    return this.options.roles
  }
}
