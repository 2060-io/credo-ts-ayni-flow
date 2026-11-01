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
  LINK_SESSION_REQUEST_TYPE,
  LINK_SESSION_RESPONSE_TYPE,
  LinkSessionEventTypes,
  LinkSessionModule,
  LinkSessionRequestMessage,
  LinkSessionResponseMessage,
  LinkSessionRole,
  LinkSessionState,
  type LinkSessionStateChangedEvent,
  mayBind,
} from '../src'

const request = {
  agent: { did: 'did:webvh:acme', name: 'Acme Support' },
  browser: { description: 'Firefox on Linux', platform: 'web' as const },
  webOrigin: 'https://ayni.acme.example',
  startedAt: '2026-10-24T15:20:41.000Z',
  invitationId: 'inv-1',
  codes: null,
}

describe('link-session/1.0 messages', () => {
  it('serialises request and response as the profile §6.7 example', () => {
    const message = new LinkSessionRequestMessage({ ...request, id: 'req-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': LINK_SESSION_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      agent: { did: 'did:webvh:acme', name: 'Acme Support' },
      browser: { description: 'Firefox on Linux', platform: 'web' },
      web_origin: 'https://ayni.acme.example',
      started_at: '2026-10-24T15:20:41.000Z',
      invitation_id: 'inv-1',
      codes: null,
    })

    const response = new LinkSessionResponseMessage({ id: 'res-1', threadId: 'req-1', link: true, code: '71 30' })
    expect(JsonTransformer.toJSON(response)).toEqual({
      '@type': LINK_SESSION_RESPONSE_TYPE,
      '@id': 'res-1',
      '~thread': { thid: 'req-1' },
      link: true,
      code: '71 30',
    })
  })

  it('decides the binding from link, codes and code', () => {
    expect(mayBind(request, { link: true })).toBe(true)
    expect(mayBind(request, { link: false })).toBe(false)
    const withCodes = { ...request, codes: ['71 30', '12 09', '55 41'] }
    expect(mayBind(withCodes, { link: true, code: '71 30' }, '71 30')).toBe(true)
    expect(mayBind(withCodes, { link: true, code: '12 09' }, '71 30')).toBe(false)
    expect(mayBind(withCodes, { link: true }, '71 30')).toBe(false)
  })
})

const modules = (roles: LinkSessionRole[]) => ({ linkSession: new LinkSessionModule({ roles }) })

describe('link-session/1.0 between an agent and a holder', () => {
  const network = new SubjectNetwork()
  let agent: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let agentConnectionId: string

  const state = (a: TestAgent<any>, s: LinkSessionState, threadId?: string) =>
    waitForEvent<LinkSessionStateChangedEvent>(
      a,
      LinkSessionEventTypes.LinkSessionStateChanged,
      (e) => e.payload.record.state === s && (!threadId || e.payload.record.threadId === threadId)
    )

  beforeAll(async () => {
    agent = createTestAgent({ name: 'agent', network, modules: modules([LinkSessionRole.Agent]) })
    holder = createTestAgent({ name: 'holder', network, modules: modules([LinkSessionRole.Holder]) })
    await agent.initialize()
    await holder.initialize()
    const [c] = await makeConnection(agent, holder)
    agentConnectionId = c.id
  })

  afterAll(async () => {
    await holder.shutdown()
    await agent.shutdown()
  })

  it('links a browser with a yes', async () => {
    const sent = await agent.modules.linkSession.request({ connectionId: agentConnectionId, request })
    const received = (await state(holder, LinkSessionState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual(request)

    const answered = state(agent, LinkSessionState.ResponseReceived, sent.threadId)
    await holder.modules.linkSession.respond({ threadId: sent.threadId, response: { link: true } })
    const agentRecord = (await answered).payload.record
    expect(agentRecord.response).toEqual({ link: true, code: null })
    expect(mayBind(agentRecord.request, agentRecord.response!)).toBe(true)
  })

  it('needs a code on a known-device re-link and refuses malformed code lists', async () => {
    await expect(
      agent.modules.linkSession.request({
        connectionId: agentConnectionId,
        request: { ...request, codes: ['1', '1', '2'] },
      })
    ).rejects.toThrow(/distinct/)

    const sent = await agent.modules.linkSession.request({
      connectionId: agentConnectionId,
      request: { ...request, codes: ['71 30', '12 09', '55 41'] },
    })
    await state(holder, LinkSessionState.RequestReceived, sent.threadId)
    await expect(
      holder.modules.linkSession.respond({ threadId: sent.threadId, response: { link: true } })
    ).rejects.toThrow(/code is required/)

    const answered = state(agent, LinkSessionState.ResponseReceived, sent.threadId)
    await holder.modules.linkSession.respond({ threadId: sent.threadId, response: { link: true, code: '12 09' } })
    const agentRecord = (await answered).payload.record
    expect(mayBind(agentRecord.request, agentRecord.response!, '71 30')).toBe(false)
    expect(mayBind(agentRecord.request, agentRecord.response!, '12 09')).toBe(true)
  })
})
