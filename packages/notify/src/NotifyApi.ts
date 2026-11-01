import { AgentContext, CredoError, injectable } from '@credo-ts/core'
import { DidCommConnectionService, DidCommMessageSender, getOutboundDidCommMessageContext } from '@credo-ts/didcomm'

import type { NotifyNotification } from './fields'
import { NotifyNotificationMessage } from './messages'
import { validateNotification } from './validation'

export interface SendNotificationOptions {
  connectionId: string
  /** The flow id when the notification is sent as a `notify` flow (`~thread.pthid`). */
  parentThreadId?: string
  notification: NotifyNotification
}

/** `https://didcomm.org/notify/1.0` (Ayni Flow Profile 1.0 §6.10). */
@injectable()
export class NotifyApi {
  public constructor(
    private readonly agentContext: AgentContext,
    private readonly messageSender: DidCommMessageSender,
    private readonly connectionService: DidCommConnectionService
  ) {}

  /** Sends a `notification`; returns the message id. */
  public async send(options: SendNotificationOptions): Promise<{ messageId: string }> {
    const invalid = validateNotification(options.notification)
    if (invalid) throw new CredoError(`notify: invalid notification: ${invalid}`)

    const connectionRecord = await this.connectionService.getById(this.agentContext, options.connectionId)
    connectionRecord.assertReady()

    const message = new NotifyNotificationMessage({ ...options.notification, parentThreadId: options.parentThreadId })
    const outbound = await getOutboundDidCommMessageContext(this.agentContext, { message, connectionRecord })
    await this.messageSender.sendMessage(outbound)
    return { messageId: message.id }
  }
}
