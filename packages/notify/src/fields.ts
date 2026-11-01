export const NOTIFY_PRIORITIES = ['normal', 'low'] as const
export type NotifyPriority = (typeof NOTIFY_PRIORITIES)[number]

/**
 * The `notification` body of notify/1.0 (profile §6.10, FLOW-NOTIFY-001): the holder posts an OS notification with the
 * title and preview, grouped by `collapse_key`, marks the conversation unread and refreshes it on open.
 */
export interface NotifyNotification {
  conversationId: string
  sessionId?: string | null
  title: string
  preview?: string | null
  collapseKey: string
  priority: NotifyPriority
}
