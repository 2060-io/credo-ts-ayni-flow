import {
  createTestAgent,
  makeConnection,
  SubjectNetwork,
  type TestAgent,
  waitForEvent,
} from '@ayni.org/credo-ts-ayni-test-utils'
import { JsonTransformer } from '@credo-ts/core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  SESSION_GRANT_REQUEST_TYPE,
  SESSION_GRANT_RESPONSE_TYPE,
  SessionGrantEventTypes,
  SessionGrantGrantMessage,
  SessionGrantModule,
  SessionGrantRequestMessage,
  SessionGrantRole,
  SessionGrantState,
  type SessionGrantStateChangedEvent,
} from '../src'

const request = {
  agentDid: 'did:webvh:acme',
  conversationId: null,
  newConversation: false,
  client: { description: 'Ayni on iPhone', platform: 'ios' as const, appVersion: '1.0.0' },
}

describe('session-grant/1.0 messages', () => {
  it('serialises request and grant as the profile §6.8 example', () => {
    const message = new SessionGrantRequestMessage({ ...request, id: 'req-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': SESSION_GRANT_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      agent_did: 'did:webvh:acme',
      conversation_id: null,
      new_conversation: false,
      client: { description: 'Ayni on iPhone', platform: 'ios', app_version: '1.0.0' },
    })
    expect(SESSION_GRANT_RESPONSE_TYPE).toBe('https://didcomm.org/session-grant/1.0/grant')

    const grant = new SessionGrantGrantMessage({
      id: 'g-1',
      threadId: 'req-1',
      parentThreadId: 'f1ow-1',
      grant: 'opaque',
      sessionsUrl: 'https://agent.acme.example/ayni/sessions',
      expiresAt: '2026-10-24T15:22:00Z',
    })
    expect(JsonTransformer.toJSON(grant)).toEqual({
      '@type': SESSION_GRANT_RESPONSE_TYPE,
      '@id': 'g-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      grant: 'opaque',
      sessions_url: 'https://agent.acme.example/ayni/sessions',
      expires_at: '2026-10-24T15:22:00.000Z',
    })
  })
})

const modules = (roles: SessionGrantRole[]) => ({ sessionGrant: new SessionGrantModule({ roles }) })

describe('session-grant/1.0 between a holder and an agent', () => {
  const network = new SubjectNetwork()
  let holder: TestAgent<ReturnType<typeof modules>>
  let agent: TestAgent<ReturnType<typeof modules>>
  let holderConnectionId: string

  const state = (a: TestAgent<any>, s: SessionGrantState, threadId?: string) =>
    waitForEvent<SessionGrantStateChangedEvent>(
      a,
      SessionGrantEventTypes.SessionGrantStateChanged,
      (e) => e.payload.record.state === s && (!threadId || e.payload.record.threadId === threadId)
    )

  beforeAll(async () => {
    holder = createTestAgent({ name: 'holder', network, modules: modules([SessionGrantRole.Requester]) })
    agent = createTestAgent({ name: 'agent', network, modules: modules([SessionGrantRole.Agent]) })
    await holder.initialize()
    await agent.initialize()
    const [c] = await makeConnection(holder, agent)
    holderConnectionId = c.id
  })

  afterAll(async () => {
    await agent.shutdown()
    await holder.shutdown()
  })

  it('obtains a grant valid for at most sixty seconds', async () => {
    const sent = await holder.modules.sessionGrant.request({ connectionId: holderConnectionId, request })
    const received = (await state(agent, SessionGrantState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual(request)
    expect(received.role).toBe(SessionGrantRole.Agent)

    await expect(
      agent.modules.sessionGrant.respond({
        threadId: sent.threadId,
        response: {
          grant: 'g',
          sessionsUrl: 'https://agent.example/ayni/sessions',
          expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
        },
      })
    ).rejects.toThrow(/sixty/)

    const granted = state(holder, SessionGrantState.ResponseReceived, sent.threadId)
    const expiresAt = new Date(Date.now() + 60_000).toISOString()
    await agent.modules.sessionGrant.respond({
      threadId: sent.threadId,
      response: { grant: 'single-use', sessionsUrl: 'https://agent.example/ayni/sessions', expiresAt },
    })
    expect((await granted).payload.record.response).toEqual({
      grant: 'single-use',
      sessionsUrl: 'https://agent.example/ayni/sessions',
      expiresAt,
    })
  })

  it('refuses a request without a DID', async () => {
    await expect(
      holder.modules.sessionGrant.request({
        connectionId: holderConnectionId,
        request: { ...request, agentDid: 'acme' },
      })
    ).rejects.toThrow(/DID/)
  })
})
