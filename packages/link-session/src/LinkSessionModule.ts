import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { LinkSessionRequestHandler, LinkSessionResponseHandler } from './handlers'
import { LinkSessionApi } from './LinkSessionApi'
import { LinkSessionModuleConfig, type LinkSessionModuleConfigOptions } from './LinkSessionModuleConfig'
import { LINK_SESSION_PROTOCOL_URI } from './messages'
import { LinkSessionRepository } from './repository'
import { LinkSessionService } from './services'

/** Credo module for `https://didcomm.org/link-session/1.0` (Ayni Flow Profile 1.0 §6.7). */
export class LinkSessionModule implements Module {
  public readonly api = LinkSessionApi
  public readonly config: LinkSessionModuleConfig

  public constructor(options: LinkSessionModuleConfigOptions) {
    this.config = new LinkSessionModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(LinkSessionModuleConfig, this.config)
    dependencyManager.registerContextScoped(LinkSessionApi)
    dependencyManager.registerSingleton(LinkSessionRepository)
    dependencyManager.registerSingleton(LinkSessionService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(LinkSessionService)

    messageHandlerRegistry.registerMessageHandlers([
      new LinkSessionRequestHandler(service),
      new LinkSessionResponseHandler(service),
    ])
    featureRegistry.register(new DidCommProtocol({ id: LINK_SESSION_PROTOCOL_URI, roles: this.config.roles }))
  }
}
