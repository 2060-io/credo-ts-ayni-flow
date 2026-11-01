import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { SignTxRequestHandler, SignTxResponseHandler } from './handlers'
import { SIGN_TX_PROTOCOL_URI } from './messages'
import { SignTxRepository } from './repository'
import { SignTxApi } from './SignTxApi'
import { SignTxModuleConfig, type SignTxModuleConfigOptions } from './SignTxModuleConfig'
import { SignTxService } from './services'

/** Credo module for `https://didcomm.org/sign-tx/1.0` (Ayni Flow Profile 1.0 §6.9). */
export class SignTxModule implements Module {
  public readonly api = SignTxApi
  public readonly config: SignTxModuleConfig

  public constructor(options: SignTxModuleConfigOptions) {
    this.config = new SignTxModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(SignTxModuleConfig, this.config)
    dependencyManager.registerContextScoped(SignTxApi)
    dependencyManager.registerSingleton(SignTxRepository)
    dependencyManager.registerSingleton(SignTxService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(SignTxService)

    messageHandlerRegistry.registerMessageHandlers([
      new SignTxRequestHandler(service),
      new SignTxResponseHandler(service),
    ])
    featureRegistry.register(new DidCommProtocol({ id: SIGN_TX_PROTOCOL_URI, roles: this.config.roles }))
  }
}
