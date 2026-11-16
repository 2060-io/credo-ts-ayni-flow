import { EventEmitter } from '@credo-ts/core'
import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PeerStatusAuthenticateMessage } from '../messages'
import { PeerStatusModuleConfig } from '../PeerStatusModuleConfig'
import { type PeerStatusAuthenticateReceivedEvent, PeerStatusEventTypes } from '../types'

/**
 * Inbound `authenticate` (FLOW-STAT-009): the peer asks to be asked for its credential. The module answers
 * nothing: the host decides, and opens an `authenticate` flow when the peer is one it would authenticate.
 */
export class PeerStatusAuthenticateHandler implements DidCommMessageHandler {
  public supportedMessages = [PeerStatusAuthenticateMessage]

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<PeerStatusAuthenticateHandler>) {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()
    if (!agentContext.dependencyManager.resolve(PeerStatusModuleConfig).isNotifier) {
      agentContext.config.logger.debug('peer-status: authenticate ignored, this agent is not a notifier')
      return undefined
    }
    agentContext.dependencyManager.resolve(EventEmitter).emit<PeerStatusAuthenticateReceivedEvent>(agentContext, {
      type: PeerStatusEventTypes.PeerStatusAuthenticateReceived,
      payload: { connectionId: connection.id, messageId: message.id },
    })
    return undefined
  }
}
