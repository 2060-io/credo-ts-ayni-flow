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
  REISSUE_REQUEST_TYPE,
  ReissueEventTypes,
  ReissueModule,
  ReissueRequestMessage,
  ReissueRole,
  ReissueState,
  type ReissueStateChangedEvent,
} from '../src'

const request = {
  reference: { credentialId: 'cred-1', schemaId: 'schema-1', credDefId: 'cd-1', issuedAt: '2026-03-02T10:00:00.000Z' },
  reason: 'restore',
}

describe('reissue/1.0 messages', () => {
  it('serialises request as the profile §6.11 example', () => {
    const message = new ReissueRequestMessage({ ...request, id: 'req-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': REISSUE_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      reference: {
        credential_id: 'cred-1',
        schema_id: 'schema-1',
        cred_def_id: 'cd-1',
        issued_at: '2026-03-02T10:00:00.000Z',
      },
      reason: 'restore',
    })
  })
})

const modules = (roles: ReissueRole[]) => ({ reissue: new ReissueModule({ roles }) })

describe('reissue/1.0 between a holder and an issuer', () => {
  const network = new SubjectNetwork()
  let holder: TestAgent<ReturnType<typeof modules>>
  let issuer: TestAgent<ReturnType<typeof modules>>
  let holderConnectionId: string

  const state = (a: TestAgent<any>, s: ReissueState, threadId?: string) =>
    waitForEvent<ReissueStateChangedEvent>(
      a,
      ReissueEventTypes.ReissueStateChanged,
      (e) => e.payload.record.state === s && (!threadId || e.payload.record.threadId === threadId)
    )

  beforeAll(async () => {
    holder = createTestAgent({ name: 'holder', network, modules: modules([ReissueRole.Requester]) })
    issuer = createTestAgent({ name: 'issuer', network, modules: modules([ReissueRole.Issuer]) })
    await holder.initialize()
    await issuer.initialize()
    const [c] = await makeConnection(holder, issuer)
    holderConnectionId = c.id
  })

  afterAll(async () => {
    await issuer.shutdown()
    await holder.shutdown()
  })

  it('asks for a reissue; both ends record the answer the host gives', async () => {
    const sent = await holder.modules.reissue.request({
      connectionId: holderConnectionId,
      parentThreadId: 'f1ow-r',
      request,
    })
    const received = (await state(issuer, ReissueState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual(request)
    expect(received.flowId).toBe('f1ow-r')

    // the issuer opens an `issue` flow (not shown) and marks the request answered; the holder does the same when it arrives
    expect((await issuer.modules.reissue.markAnswered(sent.threadId)).state).toBe(ReissueState.Answered)
    expect((await holder.modules.reissue.markAnswered(sent.threadId)).state).toBe(ReissueState.Answered)

    const other = await holder.modules.reissue.request({ connectionId: holderConnectionId, request })
    await state(issuer, ReissueState.RequestReceived, other.threadId)
    const failed = await issuer.modules.reissue.fail(other.threadId, 'not-eligible', 'the badge was revoked')
    expect(failed.state).toBe(ReissueState.Failed)
    expect(failed.errorCode).toBe('not-eligible')
  })

  it('refuses a request without a reason', async () => {
    await expect(
      holder.modules.reissue.request({ connectionId: holderConnectionId, request: { ...request, reason: '' } })
    ).rejects.toThrow(/reason/)
  })
})
