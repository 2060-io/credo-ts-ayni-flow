import type { VsAgentNestPlugin } from '@verana-labs/vs-agent-sdk'

import { ayniFlowEvents } from '../events/ayniFlowEvents.js'
import { setupAyniFlowProtocols } from '../sdk/setupAyniFlowProtocols.js'
import type { AyniFlowPluginOptions, AyniFlowSide } from '../types.js'
import { AYNI_FLOW_DIDCOMM_MODULES } from './didcommModules.js'
import { V2DidcommAyniFlowController } from './V2DidcommAyniFlowController.js'
import {
  V2DidcommAuthorizeController,
  V2DidcommConfirmController,
  V2DidcommLinkSessionController,
  V2DidcommNotifyController,
  V2DidcommReissueController,
  V2DidcommRevocationNotificationController,
  V2DidcommSessionGrantController,
  V2DidcommSignTxController,
} from './V2DidcommCarrierControllers.js'

export const AYNI_FLOW_PLUGIN_NAME = 'ayni-flow'

/** The VS Agent plugin: Credo modules, Admin API v2 routes under `/v2/didcomm/...`, message routing and webhook events. */
export const AyniFlowPlugin = (options: AyniFlowPluginOptions = {}): VsAgentNestPlugin => ({
  name: AYNI_FLOW_PLUGIN_NAME,
  credoPlugin: setupAyniFlowProtocols(options),
  controllers: [
    V2DidcommAyniFlowController,
    V2DidcommAuthorizeController,
    V2DidcommConfirmController,
    V2DidcommLinkSessionController,
    V2DidcommSessionGrantController,
    V2DidcommSignTxController,
    V2DidcommNotifyController,
    V2DidcommReissueController,
    V2DidcommRevocationNotificationController,
  ],
  didcommModules: [...AYNI_FLOW_DIDCOMM_MODULES],
  registerEvents: (agent, logger) => {
    ayniFlowEvents(agent, logger)
  },
})

/** Environment variables the generic plugin loader hands to `createVsAgentPlugin`. */
export const AYNI_FLOW_ENV = {
  /** `service` (default) or `holder` */
  side: 'AYNI_FLOW_SIDE',
  /** comma-separated kinds accepted in an `open`; defaults per side */
  supportedKinds: 'AYNI_FLOW_SUPPORTED_KINDS',
  /** pending flows per connection beyond which an `open` is refused; defaults per side */
  maxPendingFlows: 'AYNI_FLOW_MAX_PENDING',
  /** local expiry sweep interval in milliseconds; 0 disables it */
  expiryCheckIntervalMs: 'AYNI_FLOW_EXPIRY_CHECK_MS',
} as const

/**
 * The factory VS Agent's plugin loader calls for a package named in `VS_AGENT_PLUGIN_PACKAGES`: builds the plugin
 * from the process environment.
 */
export function createVsAgentPlugin(env: NodeJS.ProcessEnv = process.env): VsAgentNestPlugin {
  const side = env[AYNI_FLOW_ENV.side]
  if (side !== undefined && side !== 'service' && side !== 'holder') {
    throw new Error(`${AYNI_FLOW_ENV.side} must be 'service' or 'holder', got '${side}'`)
  }
  const integer = (name: string): number | undefined => {
    const value = env[name]
    if (value === undefined || value === '') return undefined
    const parsed = Number(value)
    if (!Number.isInteger(parsed) || parsed < 0)
      throw new Error(`${name} must be a non-negative integer, got '${value}'`)
    return parsed
  }
  const kinds = env[AYNI_FLOW_ENV.supportedKinds]
  return AyniFlowPlugin({
    side: side as AyniFlowSide | undefined,
    supportedKinds: kinds
      ? kinds
          .split(',')
          .map((kind) => kind.trim())
          .filter(Boolean)
      : undefined,
    maxPendingFlows: integer(AYNI_FLOW_ENV.maxPendingFlows),
    expiryCheckIntervalMs: integer(AYNI_FLOW_ENV.expiryCheckIntervalMs),
  })
}
