import { EventEmitter } from '@credo-ts/core'
import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { PeerStatusStatusMessage } from '../messages'
import { PeerStatusModuleConfig } from '../PeerStatusModuleConfig'
import { PeerStatusRepository } from '../repository'
import { PeerStatusEventTypes, type PeerStatusReceivedEvent } from '../types'
import { validateStatus } from '../validation'

/**
 * Inbound `status`: kept as the status of the connection in place of the one before, then announced
 * (`PeerStatusReceived`). A status that breaks a rule of the profile changes nothing.
 */
export class PeerStatusStatusHandler implements DidCommMessageHandler {
  public supportedMessages = [PeerStatusStatusMessage]

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<PeerStatusStatusHandler>) {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()
    const config = agentContext.dependencyManager.resolve(PeerStatusModuleConfig)
    if (!config.isReceiver) {
      agentContext.config.logger.debug('peer-status: status ignored, this agent is not a receiver')
      return undefined
    }
    const status = message.toStatus()
    const invalid = validateStatus(status)
    if (invalid) {
      agentContext.config.logger.warn(`peer-status: status of connection ${connection.id} ignored: ${invalid}`)
      return undefined
    }

    const repository = agentContext.dependencyManager.resolve(PeerStatusRepository)
    let previous: PeerStatusReceivedEvent['payload']['previous']
    await repository.upsert(agentContext, connection.id, (record) => {
      previous = record.received
      record.received = status
      record.receivedAt = new Date().toISOString()
    })

    agentContext.dependencyManager.resolve(EventEmitter).emit<PeerStatusReceivedEvent>(agentContext, {
      type: PeerStatusEventTypes.PeerStatusReceived,
      payload: { connectionId: connection.id, status, previous, messageId: message.id },
    })
    return undefined
  }
}
