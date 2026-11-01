import { NotifyRole } from './types'

export interface NotifyModuleConfigOptions {
  /** The roles this agent plays, disclosed through discover-features (profile §3): the Ayni app `receiver`, an agent `sender`. */
  roles: NotifyRole[]
}

export class NotifyModuleConfig {
  private readonly options: NotifyModuleConfigOptions

  public constructor(options: NotifyModuleConfigOptions) {
    if (!options?.roles?.length) {
      throw new Error('notify: NotifyModule needs at least one role')
    }
    this.options = options
  }

  public get roles(): NotifyRole[] {
    return this.options.roles
  }
}
