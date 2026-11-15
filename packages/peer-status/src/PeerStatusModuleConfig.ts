import { PeerStatusRole } from './types'

export interface PeerStatusModuleConfigOptions {
  /**
   * The roles this agent plays, disclosed through discover-features (profile §3): the Ayni app `receiver`, a service
   * `notifier`, and both for a service that also talks to other services.
   */
  roles: PeerStatusRole[]
}

export class PeerStatusModuleConfig {
  private readonly options: PeerStatusModuleConfigOptions

  public constructor(options: PeerStatusModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('peer-status: PeerStatusModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): PeerStatusRole[] {
    return this.options.roles
  }

  public get isNotifier(): boolean {
    return this.options.roles.includes(PeerStatusRole.Notifier)
  }

  public get isReceiver(): boolean {
    return this.options.roles.includes(PeerStatusRole.Receiver)
  }
}
