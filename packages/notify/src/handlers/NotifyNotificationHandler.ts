import { EventEmitter } from '@credo-ts/core'
import type { DidCommMessageHandler, DidCommMessageHandlerInboundMessage } from '@credo-ts/didcomm'

import { NotifyNotificationMessage } from '../messages'
import { NotifyEventTypes, type NotifyNotificationReceivedEvent } from '../types'

/** Inbound `notification`: emits `NotifyNotificationReceived`; nothing is stored, the host posts the OS notification. */
export class NotifyNotificationHandler implements DidCommMessageHandler {
  public supportedMessages = [NotifyNotificationMessage]

  public async handle(messageContext: DidCommMessageHandlerInboundMessage<NotifyNotificationHandler>) {
    const { message, agentContext } = messageContext
    const connection = messageContext.assertReadyConnection()

    agentContext.dependencyManager.resolve(EventEmitter).emit<NotifyNotificationReceivedEvent>(agentContext, {
      type: NotifyEventTypes.NotifyNotificationReceived,
      payload: {
        message,
        notification: message.toNotification(),
        connectionId: connection.id,
        parentThreadId: message.thread?.parentThreadId,
      },
    })
    return undefined
  }
}
