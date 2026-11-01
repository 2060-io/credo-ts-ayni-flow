import type { BaseEvent } from '@credo-ts/core'

import type { NotifyNotification } from './fields'
import type { NotifyNotificationMessage } from './messages'

export * from './fields'

/** The protocol roles disclosed through discover-features (profile §3): the holder is the `receiver`, the agent the `sender`. */
export enum NotifyRole {
  Sender = 'sender',
  Receiver = 'receiver',
}

export enum NotifyEventTypes {
  NotifyNotificationReceived = 'NotifyNotificationReceived',
}

/** Emitted for every `notification` received; the holder computes the OS notification from it (matrix rows 18 and 19). */
export interface NotifyNotificationReceivedEvent extends BaseEvent {
  type: typeof NotifyEventTypes.NotifyNotificationReceived
  payload: {
    message: NotifyNotificationMessage
    notification: NotifyNotification
    connectionId: string
    /** The flow id when the notification came inside an ayni-flow. */
    parentThreadId?: string
  }
}
