import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { ReissueRequestHandler } from './handlers'
import { REISSUE_PROTOCOL_URI } from './messages'
import { ReissueApi } from './ReissueApi'
import { ReissueModuleConfig, type ReissueModuleConfigOptions } from './ReissueModuleConfig'
import { ReissueRepository } from './repository'
import { ReissueService } from './services'

/** Credo module for `https://didcomm.org/reissue/1.0` (Ayni Flow Profile 1.0 §6.11). */
export class ReissueModule implements Module {
  public readonly api = ReissueApi
  public readonly config: ReissueModuleConfig

  public constructor(options: ReissueModuleConfigOptions) {
    this.config = new ReissueModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(ReissueModuleConfig, this.config)
    dependencyManager.registerContextScoped(ReissueApi)
    dependencyManager.registerSingleton(ReissueRepository)
    dependencyManager.registerSingleton(ReissueService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(ReissueService)

    messageHandlerRegistry.registerMessageHandlers([new ReissueRequestHandler(service)])
    featureRegistry.register(new DidCommProtocol({ id: REISSUE_PROTOCOL_URI, roles: this.config.roles }))
  }
}
