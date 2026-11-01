import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'

import { AuthorizeApi } from './AuthorizeApi'
import { AuthorizeModuleConfig, type AuthorizeModuleConfigOptions } from './AuthorizeModuleConfig'
import { AuthorizeRequestHandler, AuthorizeResponseHandler } from './handlers'
import { AUTHORIZE_PROTOCOL_URI } from './messages'
import { AuthorizeRepository } from './repository'
import { AuthorizeService } from './services'

/** Credo module for `https://didcomm.org/authorize/1.0` (Ayni Flow Profile 1.0 §6.5). */
export class AuthorizeModule implements Module {
  public readonly api = AuthorizeApi
  public readonly config: AuthorizeModuleConfig

  public constructor(options: AuthorizeModuleConfigOptions) {
    this.config = new AuthorizeModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(AuthorizeModuleConfig, this.config)
    dependencyManager.registerContextScoped(AuthorizeApi)
    dependencyManager.registerSingleton(AuthorizeRepository)
    dependencyManager.registerSingleton(AuthorizeService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(AuthorizeService)

    messageHandlerRegistry.registerMessageHandlers([
      new AuthorizeRequestHandler(service),
      new AuthorizeResponseHandler(service),
    ])
    featureRegistry.register(new DidCommProtocol({ id: AUTHORIZE_PROTOCOL_URI, roles: this.config.roles }))
  }
}
