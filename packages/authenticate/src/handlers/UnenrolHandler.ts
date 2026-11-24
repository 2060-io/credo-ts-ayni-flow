import { EventEmitter } from '@credo-ts/core'
import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { AuthenticateModuleConfig } from '../AuthenticateModuleConfig'
import { UnenrolMessage } from '../messages'
import { AuthenticateEventTypes, type UnenrolReceivedEvent } from '../types'
import { validateEnrolRequest } from '../validation'

/**
 * Inbound `unenrol` (service), outside any flow (§6.4): announced (`AuthenticateUnenrolReceived`); the host removes
 * the method and answers with a peer status whose `enrolled` no longer lists it (FLOW-SIGNIN-014). An unknown type is
 * ignored.
 */
export class UnenrolHandler implements DidCommMessageHandler {
  public supportedMessages = [UnenrolMessage]

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<UnenrolHandler>) {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()
    if (!agentContext.dependencyManager.resolve(AuthenticateModuleConfig).isRequester) {
      agentContext.config.logger.debug('authenticate: unenrol ignored, this agent is not a requester')
      return undefined
    }
    const unenrol = message.toUnenrol()
    const invalid = validateEnrolRequest(unenrol)
    if (invalid) {
      agentContext.config.logger.warn(`authenticate: unenrol '${message.id}' ignored: ${invalid}`)
      return undefined
    }
    agentContext.dependencyManager.resolve(EventEmitter).emit<UnenrolReceivedEvent>(agentContext, {
      type: AuthenticateEventTypes.UnenrolReceived,
      payload: { ...unenrol, connectionId: connection.id, messageId: message.id },
    })
    return undefined
  }
}
