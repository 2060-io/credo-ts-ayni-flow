import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { PeerStatusAuthenticateHandler, PeerStatusQueryHandler, PeerStatusStatusHandler } from './handlers'
import { PEER_STATUS_PROTOCOL_URI } from './messages'
import { PeerStatusApi } from './PeerStatusApi'
import { PeerStatusModuleConfig, type PeerStatusModuleConfigOptions } from './PeerStatusModuleConfig'
import { PeerStatusRepository } from './repository'

/** Credo module for `https://didcomm.org/peer-status/1.0` (Ayni Flow Profile 1.0 §4.1). */
export class PeerStatusModule implements Module {
  public readonly api = PeerStatusApi
  public readonly config: PeerStatusModuleConfig

  public constructor(options: PeerStatusModuleConfigOptions) {
    this.config = new PeerStatusModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(PeerStatusModuleConfig, this.config)
    dependencyManager.registerContextScoped(PeerStatusApi)
    dependencyManager.registerSingleton(PeerStatusRepository)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)

    messageHandlerRegistry.registerMessageHandlers([
      new PeerStatusStatusHandler(),
      new PeerStatusQueryHandler(),
      new PeerStatusAuthenticateHandler(),
    ])
    featureRegistry.register(new DidCommProtocol({ id: PEER_STATUS_PROTOCOL_URI, roles: this.config.roles }))
  }
}
