import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@2060.io/credo-ts-ayni-test-utils'
import { JsonTransformer } from '@credo-ts/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  NOTIFY_NOTIFICATION_TYPE,
  NotifyEventTypes,
  NotifyModule,
  NotifyNotificationMessage,
  type NotifyNotificationReceivedEvent,
  NotifyRole,
} from '../src'

const notification = {
  conversationId: 'c_41',
  sessionId: null,
  title: 'Acme Support replied',
  preview: 'Your ticket is solved.',
  collapseKey: 'c_41',
  priority: 'normal' as const,
}

describe('notify/1.0 messages', () => {
  it('serialises notification as the profile §6.10 example', () => {
    const message = new NotifyNotificationMessage({ ...notification, id: 'n-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': NOTIFY_NOTIFICATION_TYPE,
      '@id': 'n-1',
      '~thread': { pthid: 'f1ow-1' },
      conversation_id: 'c_41',
      session_id: null,
      title: 'Acme Support replied',
      preview: 'Your ticket is solved.',
      collapse_key: 'c_41',
      priority: 'normal',
    })
  })
})

const modules = (roles: NotifyRole[]) => ({ notify: new NotifyModule({ roles }) })

describe('notify/1.0 between an agent and a holder', () => {
  const network = new SubjectNetwork()
  let agent: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let agentConnectionId: string
  let holderConnectionId: string

  beforeAll(async () => {
    agent = createTestAgent({ name: 'agent', network, modules: modules([NotifyRole.Sender]) })
    holder = createTestAgent({ name: 'holder', network, modules: modules([NotifyRole.Receiver]) })
    await agent.initialize()
    await holder.initialize()
    const [a, h] = await makeConnection(agent, holder)
    agentConnectionId = a.id
    holderConnectionId = h.id
  })

  afterAll(async () => {
    await holder.shutdown()
    await agent.shutdown()
  })

  it('delivers the notification as an event on the holder', async () => {
    const received = waitForEvent<NotifyNotificationReceivedEvent>(holder, NotifyEventTypes.NotifyNotificationReceived)
    const { messageId } = await agent.modules.notify.send({
      connectionId: agentConnectionId,
      parentThreadId: 'f1ow-n',
      notification,
    })
    const { payload } = await received
    expect(payload.message.id).toBe(messageId)
    expect(payload.notification).toEqual(notification)
    expect(payload.connectionId).toBe(holderConnectionId)
    expect(payload.parentThreadId).toBe('f1ow-n')
  })

  it('refuses a notification without a collapse key', async () => {
    await expect(
      agent.modules.notify.send({ connectionId: agentConnectionId, notification: { ...notification, collapseKey: '' } })
    ).rejects.toThrow(/collapse_key/)
  })
})
