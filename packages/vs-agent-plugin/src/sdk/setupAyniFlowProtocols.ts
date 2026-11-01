import { AuthorizeModule, AuthorizeRole } from '@ayni.org/credo-ts-didcomm-authorize'
import { AyniFlowModule, AyniFlowRole } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { ConfirmModule, ConfirmRole } from '@ayni.org/credo-ts-didcomm-confirm'
import { LinkSessionModule, LinkSessionRole } from '@ayni.org/credo-ts-didcomm-link-session'
import { NotifyModule, NotifyRole } from '@ayni.org/credo-ts-didcomm-notify'
import { ReissueModule, ReissueRole } from '@ayni.org/credo-ts-didcomm-reissue'
import { SessionGrantModule, SessionGrantRole } from '@ayni.org/credo-ts-didcomm-session-grant'
import { SignTxModule, SignTxRole } from '@ayni.org/credo-ts-didcomm-sign-tx'

import type { AyniFlowModules, AyniFlowPluginOptions } from '../types.js'

export interface AyniFlowSdkPlugin {
  modules: AyniFlowModules
}

/**
 * The Credo modules of the Ayni Flow Profile 1.0 with the roles of its §3 for one side: a service discloses
 * `requester` (authorize, confirm, sign-tx), `agent` (link-session, session-grant), `sender` (notify), `issuer`
 * (reissue) and `service` (ayni-flow); a holder the opposite roles. Must be used together with `setupBaseDidComm()`.
 */
export function setupAyniFlowProtocols(options: AyniFlowPluginOptions = {}): AyniFlowSdkPlugin {
  const service = (options.side ?? 'service') === 'service'
  return {
    modules: {
      ayniFlow: new AyniFlowModule({
        role: service ? AyniFlowRole.Service : AyniFlowRole.Holder,
        supportedKinds: options.supportedKinds,
        maxPendingFlows: options.maxPendingFlows,
        expiryCheckIntervalMs: options.expiryCheckIntervalMs ?? (service ? 60_000 : 0),
      }),
      authorize: new AuthorizeModule({ roles: [service ? AuthorizeRole.Requester : AuthorizeRole.Approver] }),
      confirm: new ConfirmModule({ roles: [service ? ConfirmRole.Requester : ConfirmRole.Confirmer] }),
      linkSession: new LinkSessionModule({ roles: [service ? LinkSessionRole.Agent : LinkSessionRole.Holder] }),
      sessionGrant: new SessionGrantModule({
        roles: [service ? SessionGrantRole.Agent : SessionGrantRole.Requester],
      }),
      signTx: new SignTxModule({ roles: [service ? SignTxRole.Requester : SignTxRole.Signer] }),
      notify: new NotifyModule({ roles: [service ? NotifyRole.Sender : NotifyRole.Receiver] }),
      reissue: new ReissueModule({ roles: [service ? ReissueRole.Issuer : ReissueRole.Requester] }),
    },
  }
}
