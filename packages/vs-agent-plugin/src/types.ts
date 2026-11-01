import type { AuthorizeModule } from '@ayni.org/credo-ts-didcomm-authorize'
import type { AyniFlowModule } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import type { ConfirmModule } from '@ayni.org/credo-ts-didcomm-confirm'
import type { LinkSessionModule } from '@ayni.org/credo-ts-didcomm-link-session'
import type { NotifyModule } from '@ayni.org/credo-ts-didcomm-notify'
import type { ReissueModule } from '@ayni.org/credo-ts-didcomm-reissue'
import type { SessionGrantModule } from '@ayni.org/credo-ts-didcomm-session-grant'
import type { SignTxModule } from '@ayni.org/credo-ts-didcomm-sign-tx'
import type { BaseAgentModules } from '@verana-labs/vs-agent-sdk'

/** The Credo modules this plugin adds to a VS Agent, by the names the Admin API controllers resolve them under. */
export type AyniFlowModules = {
  ayniFlow: AyniFlowModule
  authorize: AuthorizeModule
  confirm: ConfirmModule
  linkSession: LinkSessionModule
  sessionGrant: SessionGrantModule
  signTx: SignTxModule
  notify: NotifyModule
  reissue: ReissueModule
}

export type AyniFlowAgentModules = BaseAgentModules & AyniFlowModules

/** The side of the flow profile this VS Agent plays (§1): a Verifiable Service, or a holder for tests and tooling. */
export type AyniFlowSide = 'service' | 'holder'

export interface AyniFlowPluginOptions {
  /** Defaults to `service`: a Verifiable Service that opens flows for the Ayni app. */
  side?: AyniFlowSide
  /** Kinds this agent accepts in an `open`; defaults per side (see `AyniFlowModuleConfigOptions.supportedKinds`). */
  supportedKinds?: string[]
  /** Pending flows per connection beyond which an `open` is refused; defaults per side. */
  maxPendingFlows?: number
  /** Interval of the local expiry sweep in milliseconds; defaults to 60 000 on a service, 0 (off) on a holder. */
  expiryCheckIntervalMs?: number
}
