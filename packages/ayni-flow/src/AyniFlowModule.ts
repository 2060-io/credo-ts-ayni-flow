import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'
import { EventEmitter, InjectionSymbols } from '@credo-ts/core'
import type { DidCommMessageProcessedEvent, DidCommMessageSentEvent } from '@credo-ts/didcomm'
import {
  DidCommEventTypes,
  DidCommFeatureRegistry,
  type DidCommInboundMessageContext,
  DidCommMessageHandlerRegistry,
  DidCommProtocol,
} from '@credo-ts/didcomm'
import type { Subject } from 'rxjs'

import { AyniFlowApi } from './AyniFlowApi'
import { AyniFlowModuleConfig, type AyniFlowModuleConfigOptions } from './AyniFlowModuleConfig'
import { AyniFlowCloseHandler, AyniFlowOpenHandler, AyniFlowProblemReportHandler } from './handlers'
import {
  AYNI_FLOW_PROTOCOL_URI,
  AyniFlowCloseMessage,
  AyniFlowOpenMessage,
  AyniFlowProblemReportMessage,
} from './messages'
import { AyniFlowRepository } from './repository'
import { AyniFlowService } from './services'

const OWN_MESSAGE_TYPES = new Set([
  AyniFlowOpenMessage.type.messageTypeUri,
  AyniFlowCloseMessage.type.messageTypeUri,
  AyniFlowProblemReportMessage.type.messageTypeUri,
])

/**
 * Credo module for `https://didcomm.org/ayni-flow/1.0` (Ayni Flow Profile 1.0 §5): handlers for `open`, `close` and the
 * flow's problem reports, the protocol in discover-features with the configured role, a middleware that drops inbound
 * messages of closed or expired flows (FLOW-CORE-004/005), and the `pending` to `active` transition on the first
 * carrier message exchanged (§5.2).
 */
export class AyniFlowModule implements Module {
  public readonly api = AyniFlowApi
  public readonly config: AyniFlowModuleConfig

  public constructor(options: AyniFlowModuleConfigOptions) {
    this.config = new AyniFlowModuleConfig(options)
  }

  public register(dependencyManager: DependencyManager): void {
    dependencyManager.registerInstance(AyniFlowModuleConfig, this.config)
    dependencyManager.registerContextScoped(AyniFlowApi)
    dependencyManager.registerSingleton(AyniFlowRepository)
    dependencyManager.registerSingleton(AyniFlowService)
  }

  public async initialize(agentContext: AgentContext): Promise<void> {
    const messageHandlerRegistry = agentContext.dependencyManager.resolve(DidCommMessageHandlerRegistry)
    const featureRegistry = agentContext.dependencyManager.resolve(DidCommFeatureRegistry)
    const eventEmitter = agentContext.dependencyManager.resolve(EventEmitter)
    const service = agentContext.dependencyManager.resolve(AyniFlowService)
    const logger = agentContext.config.logger

    messageHandlerRegistry.registerMessageHandlers([
      new AyniFlowOpenHandler(service),
      new AyniFlowCloseHandler(service),
      new AyniFlowProblemReportHandler(service),
    ])

    featureRegistry.register(new DidCommProtocol({ id: AYNI_FLOW_PROTOCOL_URI, roles: [this.config.role] }))

    // After a close, and after expiry, messages carrying the flow id are ignored (profile §5.2).
    messageHandlerRegistry.registerMessageHandlerMiddleware(
      async (messageContext: DidCommInboundMessageContext, next: () => Promise<void>) => {
        const flowId = messageContext.message.thread?.parentThreadId
        if (!flowId) return next()

        const record = await service.findByFlowId(messageContext.agentContext, flowId)
        if (!record) return next()

        if (!record.isClosed && (await service.expireIfDue(messageContext.agentContext, record))) {
          logger.debug(`ayni-flow: flow '${flowId}' expired; dropping ${messageContext.message.type}`)
          return
        }
        if (record.isClosed) {
          logger.debug(`ayni-flow: flow '${flowId}' is ${record.state}; dropping ${messageContext.message.type}`)
          return
        }
        return next()
      }
    )

    // `pending` becomes `active` when the first carrier message is exchanged, in either direction.
    const activateFromCarrier = async (type: string, parentThreadId: string | undefined) => {
      if (!parentThreadId || OWN_MESSAGE_TYPES.has(type)) return
      await service.markActive(agentContext, parentThreadId).catch((error) => {
        logger.error(`ayni-flow: could not activate flow '${parentThreadId}'`, error as Record<string, unknown>)
      })
    }
    eventEmitter.on<DidCommMessageProcessedEvent>(DidCommEventTypes.DidCommMessageProcessed, ({ payload }) =>
      activateFromCarrier(payload.message.type, payload.message.thread?.parentThreadId)
    )
    eventEmitter.on<DidCommMessageSentEvent>(DidCommEventTypes.DidCommMessageSent, ({ payload }) =>
      activateFromCarrier(payload.message.message.type, payload.message.message.thread?.parentThreadId)
    )

    if (this.config.expiryCheckIntervalMs > 0) {
      const timer = setInterval(() => {
        service.expireDueFlows(agentContext).catch((error) => {
          logger.error('ayni-flow: expiry check failed', error as Record<string, unknown>)
        })
      }, this.config.expiryCheckIntervalMs)
      const stop$ = agentContext.dependencyManager.resolve<Subject<boolean>>(InjectionSymbols.Stop$)
      stop$.subscribe(() => clearInterval(timer))
    }
  }
}
