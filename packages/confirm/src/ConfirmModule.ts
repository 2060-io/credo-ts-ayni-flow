import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'

import { ConfirmApi } from './ConfirmApi'
import { ConfirmModuleConfig, type ConfirmModuleConfigOptions } from './ConfirmModuleConfig'
import { ConfirmRequestHandler, ConfirmResponseHandler } from './handlers'
import { CONFIRM_PROTOCOL_URI } from './messages'
import { ConfirmRepository } from './repository'
import { ConfirmService } from './services'

/** Credo module for `https://didcomm.org/confirm/1.0` (Ayni Flow Profile 1.0 §6.6). */
export class ConfirmModule implements Module {
  public readonly api = ConfirmApi
  public readonly config: ConfirmModuleConfig

  public constructor(options: ConfirmModuleConfigOptions) {
    this.config = new ConfirmModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(ConfirmModuleConfig, this.config)
    dependencyManager.registerContextScoped(ConfirmApi)
    dependencyManager.registerSingleton(ConfirmRepository)
    dependencyManager.registerSingleton(ConfirmService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(ConfirmService)

    messageHandlerRegistry.registerMessageHandlers([
      new ConfirmRequestHandler(service),
      new ConfirmResponseHandler(service),
    ])
    featureRegistry.register(new DidCommProtocol({ id: CONFIRM_PROTOCOL_URI, roles: this.config.roles }))
  }
}
