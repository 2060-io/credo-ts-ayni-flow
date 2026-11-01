import { NOTIFY_PRIORITIES, type NotifyNotification } from './fields'

/** The rules of profile §6.10 / FLOW-NOTIFY-001 on a notification; returns the first violation or undefined. */
export function validateNotification(notification: NotifyNotification): string | undefined {
  if (typeof notification.conversationId !== 'string' || !notification.conversationId)
    return 'conversation_id is required'
  if (typeof notification.title !== 'string' || !notification.title) return 'title is required'
  if (typeof notification.collapseKey !== 'string' || !notification.collapseKey) return 'collapse_key is required'
  if (!NOTIFY_PRIORITIES.includes(notification.priority))
    return `priority must be one of ${NOTIFY_PRIORITIES.join(', ')}`
  return undefined
}
