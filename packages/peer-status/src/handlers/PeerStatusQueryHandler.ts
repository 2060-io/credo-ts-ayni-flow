import { EventEmitter } from '@credo-ts/core'
import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'
import { DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import { PeerStatusQueryMessage, PeerStatusStatusMessage } from '../messages'
import { PeerStatusModuleConfig } from '../PeerStatusModuleConfig'
import { PeerStatusRepository } from '../repository'
import { PeerStatusEventTypes, type PeerStatusQueryReceivedEvent } from '../types'

/**
 * Inbound `query` (FLOW-STAT-006): answered with the status this agent last sent on the connection. When it has
 * sent none it has not decided yet: nothing is sent now, and the first status the host sends is the answer.
 */
export class PeerStatusQueryHandler implements DidCommMessageHandler {
  public supportedMessages = [PeerStatusQueryMessage]

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<PeerStatusQueryHandler>) {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()
    const config = agentContext.dependencyManager.resolve(PeerStatusModuleConfig)
    if (!config.isNotifier) {
      agentContext.config.logger.debug('peer-status: query ignored, this agent is not a notifier')
      return undefined
    }

    const record = await agentContext.dependencyManager
      .resolve(PeerStatusRepository)
      .findByConnectionId(agentContext, connection.id)
    const answered = !!record?.sent
    if (record?.sent) {
      const outbound = await getOutboundDidCommMessageContext(agentContext, {
        message: new PeerStatusStatusMessage(record.sent),
        connectionRecord: connection,
      })
      await agentContext.dependencyManager.resolve(DidCommMessageSender).sendMessage(outbound)
    }

    agentContext.dependencyManager.resolve(EventEmitter).emit<PeerStatusQueryReceivedEvent>(agentContext, {
      type: PeerStatusEventTypes.PeerStatusQueryReceived,
      payload: { connectionId: connection.id, answered, messageId: message.id },
    })
    return undefined
  }
}
