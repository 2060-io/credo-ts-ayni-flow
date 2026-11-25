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
  validateRequest,
} from '../src'

const request = {
  reference: { credentialId: 'cred-1', schemaId: 'schema-1', credDefId: 'cd-1', issuedAt: '2026-03-02T10:00:00.000Z' },
  reason: 'restore',
}
const BADGE = 'https://ecs.example/vt/schemas-badge-jsc.json'
const missing = { reference: { jsonSchemaCredentialId: BADGE }, reason: 'missing' }

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

  it('serialises a request with the reason missing as the profile §6.11 example, the schema alone', () => {
    const message = new ReissueRequestMessage({ ...missing, id: 'req-2', parentThreadId: 'f1ow-2' })
    const json = JsonTransformer.toJSON(message)
    expect(json).toEqual({
      '@type': REISSUE_REQUEST_TYPE,
      '@id': 'req-2',
      '~thread': { thid: 'req-2', pthid: 'f1ow-2' },
      reference: { json_schema_credential_id: BADGE },
      reason: 'missing',
    })
    expect(JsonTransformer.fromJSON(json, ReissueRequestMessage).toRequest()).toEqual(missing)
  })
})

describe('reissue/1.0 request rules (FLOW-REISSUE-001)', () => {
  it('asks the four fields of the backup with the reason restore', () => {
    expect(validateRequest(request)).toBeUndefined()
    expect(validateRequest({ ...request, reference: { ...request.reference, credentialId: undefined } })).toMatch(
      /credential_id/
    )
    expect(validateRequest({ reference: { jsonSchemaCredentialId: BADGE }, reason: 'restore' })).toMatch(
      /credential_id/
    )
  })

  it('asks the schema alone with the reason missing', () => {
    expect(validateRequest(missing)).toBeUndefined()
    expect(validateRequest({ reference: {}, reason: 'missing' })).toMatch(/json_schema_credential_id/)
    expect(validateRequest({ reference: request.reference, reason: 'missing' })).toMatch(/json_schema_credential_id/)
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

  it('asks for a credential the holder holds none of (reason missing); the issuer reads the schema it names', async () => {
    const sent = await holder.modules.reissue.request({ connectionId: holderConnectionId, request: missing })
    const received = (await state(issuer, ReissueState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual(missing)
    expect(received.request.reference.jsonSchemaCredentialId).toBe(BADGE)

    const failed = await issuer.modules.reissue.fail(sent.threadId, 'unavailable', 'the earlier badge is not revoked')
    expect(failed.errorCode).toBe('unavailable')

    await expect(
      holder.modules.reissue.request({ connectionId: holderConnectionId, request: { ...missing, reference: {} } })
    ).rejects.toThrow(/json_schema_credential_id/)
  })

  it('refuses a request without a reason', async () => {
    await expect(
      holder.modules.reissue.request({ connectionId: holderConnectionId, request: { ...request, reason: '' } })
    ).rejects.toThrow(/reason/)
  })
})
