import type { AgentContext, DependencyManager, Module } from '@credo-ts/core'
import { EventEmitter, InjectionSymbols } from '@credo-ts/core'
import type { DidCommMessageProcessedEvent, DidCommMessageSentEvent } from '@credo-ts/didcomm'
import {
  DidCommEventTypes,
  DidCommFeatureRegistry,
  type DidCommInboundMessageContext,
  DidCommMessageHandlerRegistry,
  DidCommMessageSender,
  DidCommProtocol,
} from '@credo-ts/didcomm'
import type { Subject } from 'rxjs'

import { AyniFlowApi } from './AyniFlowApi'
import { AyniFlowModuleConfig, type AyniFlowModuleConfigOptions } from './AyniFlowModuleConfig'
import { AyniFlowClosedError } from './errors'
import { AyniFlowCloseHandler, AyniFlowOpenHandler, AyniFlowProblemReportHandler } from './handlers'
import {
  AYNI_FLOW_PROTOCOL_URI,
  AyniFlowCloseMessage,
  AyniFlowOpenMessage,
  AyniFlowProblemReportMessage,
} from './messages'
import { AyniFlowEarlyEndRepository, AyniFlowRepository } from './repository'
import { AyniFlowService } from './services'

const OWN_MESSAGE_TYPES = new Set([
  AyniFlowOpenMessage.type.messageTypeUri,
  AyniFlowCloseMessage.type.messageTypeUri,
  AyniFlowProblemReportMessage.type.messageTypeUri,
])

/** The message senders whose `sendMessage` already refuses carrier messages of closed flows (one per agent). */
const guardedSenders = new WeakSet<DidCommMessageSender>()

/**
 * Credo module for `https://didcomm.org/ayni-flow/1.0` (Ayni Flow Profile 1.0 §5): handlers for `open`, `close` and the
 * flow's problem reports, the protocol in discover-features with the configured role, a middleware that drops inbound
 * messages of closed or expired flows (FLOW-CORE-004/005), a guard that refuses to send a carrier message in a closed
 * flow (FLOW-CORE-005), and the `pending` to `active` transition on the first carrier message exchanged (§5.2).
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
    dependencyManager.registerSingleton(AyniFlowEarlyEndRepository)
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

    // After a close, and after expiry, messages carrying the flow id are ignored (profile §5.2); so are those of a flow
    // whose close came before its open.
    messageHandlerRegistry.registerMessageHandlerMiddleware(
      async (messageContext: DidCommInboundMessageContext, next: () => Promise<void>) => {
        const flowId = messageContext.message.thread?.parentThreadId
        if (!flowId) return next()

        const ended = await service.findEndedState(messageContext.agentContext, flowId, messageContext.connection?.id)
        if (ended) {
          logger.debug(`ayni-flow: flow '${flowId}' is ${ended}; dropping ${messageContext.message.type}`)
          return
        }
        return next()
      }
    )

    // No carrier message is sent in a closed flow (FLOW-CORE-005), whichever module sends it: a host's answer throws
    // `AyniFlowClosedError`, and a response Credo would send to an inbound message is dropped. Credo has no outbound
    // middleware, so the agent's one message sender is wrapped.
    const sender = agentContext.dependencyManager.resolve(DidCommMessageSender)
    if (!guardedSenders.has(sender)) {
      guardedSenders.add(sender)
      const sendMessage = sender.sendMessage.bind(sender)
      sender.sendMessage = async (...[outbound, options]: Parameters<DidCommMessageSender['sendMessage']>) => {
        const { message } = outbound
        const flowId = message.thread?.parentThreadId
        if (flowId && !OWN_MESSAGE_TYPES.has(message.type)) {
          const ended = await service.findEndedState(outbound.agentContext, flowId, outbound.connection?.id)
          if (ended) {
            if (outbound.inboundMessageContext) {
              logger.debug(`ayni-flow: flow '${flowId}' is ${ended}; not answering with ${message.type}`)
              return
            }
            throw new AyniFlowClosedError(flowId, ended, `${message.type} not sent`)
          }
        }
        return sendMessage(outbound, options)
      }
    }

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
