import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'
import { NotifyNotificationHandler } from './handlers'
import { NOTIFY_PROTOCOL_URI } from './messages'
import { NotifyApi } from './NotifyApi'
import { NotifyModuleConfig, type NotifyModuleConfigOptions } from './NotifyModuleConfig'

/** Credo module for `https://didcomm.org/notify/1.0` (Ayni Flow Profile 1.0 §6.10). */
export class NotifyModule implements Module {
  public readonly api = NotifyApi
  public readonly config: NotifyModuleConfig

  public constructor(options: NotifyModuleConfigOptions) {
    this.config = new NotifyModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(NotifyModuleConfig, this.config)
    dependencyManager.registerContextScoped(NotifyApi)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)

    messageHandlerRegistry.registerMessageHandlers([new NotifyNotificationHandler()])
    featureRegistry.register(new DidCommProtocol({ id: NOTIFY_PROTOCOL_URI, roles: this.config.roles }))
  }
}
