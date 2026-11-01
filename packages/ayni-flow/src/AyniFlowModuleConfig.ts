import { AyniFlowRole, DEFAULT_HOLDER_KINDS, DEFAULT_SERVICE_KINDS } from './types'

export interface AyniFlowModuleConfigOptions {
  /** The party this agent is: the Ayni app is the `holder`, a Verifiable Service the `service`. Disclosed as the protocol role (profile §3). */
  role: AyniFlowRole
  /**
   * Kinds this agent accepts in an `open`; any other kind is refused with `unsupported-kind`.
   * Defaults to every kind of §6 but `identify-ua` for a holder, and to the holder-initiated kinds for a service.
   */
  supportedKinds?: string[]
  /**
   * The number of pending flows per connection beyond which a new `open` is refused with `too-many-flows` (FLOW-CORE-008).
   * Defaults to 10 for a holder and to no limit (0) for a service.
   */
  maxPendingFlows?: number
  /**
   * Interval, in milliseconds, at which open flows past their `expires_time` are closed `expired` locally (FLOW-CORE-004).
   * 0 (the default) disables the timer: the host calls `AyniFlowApi.expireDueFlows()` itself, for example on wake-up.
   * Whatever the timer, a message of an expired flow closes it on arrival.
   */
  expiryCheckIntervalMs?: number
}

export class AyniFlowModuleConfig {
  private readonly options: AyniFlowModuleConfigOptions

  public constructor(options: AyniFlowModuleConfigOptions) {
    if (!options || !Object.values(AyniFlowRole).includes(options.role)) {
      throw new Error("ayni-flow: AyniFlowModule needs a role, 'holder' or 'service'")
    }
    this.options = options
  }

  public get role(): AyniFlowRole {
    return this.options.role
  }

  public get supportedKinds(): readonly string[] {
    if (this.options.supportedKinds) return this.options.supportedKinds
    return this.role === AyniFlowRole.Holder ? DEFAULT_HOLDER_KINDS : DEFAULT_SERVICE_KINDS
  }

  public get maxPendingFlows(): number {
    if (this.options.maxPendingFlows !== undefined) return this.options.maxPendingFlows
    return this.role === AyniFlowRole.Holder ? 10 : 0
  }

  public get expiryCheckIntervalMs(): number {
    return this.options.expiryCheckIntervalMs ?? 0
  }
}
