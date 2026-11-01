import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { SessionGrantRequestHandler, SessionGrantResponseHandler } from './handlers'
import { SESSION_GRANT_PROTOCOL_URI } from './messages'
import { SessionGrantRepository } from './repository'
import { SessionGrantApi } from './SessionGrantApi'
import { SessionGrantModuleConfig, type SessionGrantModuleConfigOptions } from './SessionGrantModuleConfig'
import { SessionGrantService } from './services'

/** Credo module for `https://didcomm.org/session-grant/1.0` (Ayni Flow Profile 1.0 §6.8). */
export class SessionGrantModule implements Module {
  public readonly api = SessionGrantApi
  public readonly config: SessionGrantModuleConfig

  public constructor(options: SessionGrantModuleConfigOptions) {
    this.config = new SessionGrantModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(SessionGrantModuleConfig, this.config)
    dependencyManager.registerContextScoped(SessionGrantApi)
    dependencyManager.registerSingleton(SessionGrantRepository)
    dependencyManager.registerSingleton(SessionGrantService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(SessionGrantService)

    messageHandlerRegistry.registerMessageHandlers([
      new SessionGrantRequestHandler(service),
      new SessionGrantResponseHandler(service),
    ])
    featureRegistry.register(new DidCommProtocol({ id: SESSION_GRANT_PROTOCOL_URI, roles: this.config.roles }))
  }
}
