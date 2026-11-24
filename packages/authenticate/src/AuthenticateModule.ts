import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'

import { DidCommFeatureRegistry, DidCommMessageHandlerRegistry, DidCommProtocol } from '@credo-ts/didcomm'

import { AuthenticateApi } from './AuthenticateApi'
import { AuthenticateModuleConfig, type AuthenticateModuleConfigOptions } from './AuthenticateModuleConfig'
import {
  AuthenticateAnswerHandler,
  AuthenticateChoiceHandler,
  AuthenticateRequestHandler,
  AuthenticateStepHandler,
  AuthenticateStepResultHandler,
  EnrolAnswerHandler,
  EnrolChallengeHandler,
  EnrolRequestHandler,
  UnenrolHandler,
} from './handlers'
import { AUTHENTICATE_PROTOCOL_URI } from './messages'
import { AuthenticateRepository, EnrolRepository } from './repository'
import { AuthenticateService } from './services'

/** Credo module for `https://didcomm.org/authenticate/1.0` (Ayni Flow Profile 1.0 §6.14, §6.4). */
export class AuthenticateModule implements Module {
  public readonly api = AuthenticateApi
  public readonly config: AuthenticateModuleConfig

  public constructor(options: AuthenticateModuleConfigOptions) {
    this.config = new AuthenticateModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(AuthenticateModuleConfig, this.config)
    dependencyManager.registerContextScoped(AuthenticateApi)
    dependencyManager.registerSingleton(AuthenticateRepository)
    dependencyManager.registerSingleton(EnrolRepository)
    dependencyManager.registerSingleton(AuthenticateService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const service = agentContext.dependencyManager.resolve(AuthenticateService)

    messageHandlerRegistry.registerMessageHandlers([
      new AuthenticateRequestHandler(service),
      new AuthenticateChoiceHandler(service),
      new AuthenticateStepHandler(service),
      new AuthenticateAnswerHandler(service),
      new AuthenticateStepResultHandler(service),
      new EnrolRequestHandler(service),
      new EnrolChallengeHandler(service),
      new EnrolAnswerHandler(service),
      new UnenrolHandler(),
    ])
    featureRegistry.register(new DidCommProtocol({ id: AUTHENTICATE_PROTOCOL_URI, roles: this.config.roles }))
  }
}
