import { AuthenticateRole } from './types'

export interface AuthenticateModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3). The Ayni app discloses
   * `authenticator`; a Verifiable Service discloses `requester`. A service opens no `authenticate` flow with a holder
   * that did not disclose the protocol (FLOW-CAP-003).
   */
  roles: AuthenticateRole[]
}

export class AuthenticateModuleConfig {
  private readonly options: AuthenticateModuleConfigOptions

  public constructor(options: AuthenticateModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('authenticate: AuthenticateModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): AuthenticateRole[] {
    return this.options.roles
  }

  public get isRequester(): boolean {
    return this.options.roles.includes(AuthenticateRole.Requester)
  }

  public get isAuthenticator(): boolean {
    return this.options.roles.includes(AuthenticateRole.Authenticator)
  }
}
