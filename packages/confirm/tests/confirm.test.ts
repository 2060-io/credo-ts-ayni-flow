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
  CONFIRM_REQUEST_TYPE,
  CONFIRM_RESPONSE_TYPE,
  ConfirmEventTypes,
  ConfirmModule,
  ConfirmRequestMessage,
  ConfirmResponseMessage,
  ConfirmRole,
  ConfirmState,
  type ConfirmStateChangedEvent,
} from '../src'

describe('confirm/1.0 messages', () => {
  it('serialises request and response as the profile §6.6 example', () => {
    const request = new ConfirmRequestMessage({
      id: 'req-1',
      parentThreadId: 'f1ow-1',
      text: 'Confirm the change of your delivery address',
      code: '48 21',
      attested: true,
    })
    expect(JsonTransformer.toJSON(request)).toEqual({
      '@type': CONFIRM_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      text: 'Confirm the change of your delivery address',
      code: '48 21',
      attested: true,
    })

    const response = new ConfirmResponseMessage({
      id: 'res-1',
      threadId: 'req-1',
      parentThreadId: 'f1ow-1',
      confirmed: true,
      attestation: { method: 'biometric', at: '2026-10-24T15:21:03Z' },
    })
    expect(JsonTransformer.toJSON(response)).toEqual({
      '@type': CONFIRM_RESPONSE_TYPE,
      '@id': 'res-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      confirmed: true,
      attestation: { method: 'biometric', at: '2026-10-24T15:21:03.000Z' },
    })
  })
})

const modules = (roles: ConfirmRole[]) => ({ confirm: new ConfirmModule({ roles }) })

describe('confirm/1.0 between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let serviceConnectionId: string

  const state = (agent: TestAgent<any>, s: ConfirmState, threadId?: string) =>
    waitForEvent<ConfirmStateChangedEvent>(
      agent,
      ConfirmEventTypes.ConfirmStateChanged,
      (e) => e.payload.record.state === s && (!threadId || e.payload.record.threadId === threadId)
    )

  beforeAll(async () => {
    service = createTestAgent({ name: 'svc', network, modules: modules([ConfirmRole.Requester]) })
    holder = createTestAgent({ name: 'hld', network, modules: modules([ConfirmRole.Confirmer]) })
    await service.initialize()
    await holder.initialize()
    const [c] = await makeConnection(service, holder)
    serviceConnectionId = c.id
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('asks for an attested confirmation and receives it', async () => {
    const sent = await service.modules.confirm.request({
      connectionId: serviceConnectionId,
      parentThreadId: 'f1ow-9',
      request: { text: 'Confirm the change of your delivery address', code: '48 21', attested: true },
    })
    const received = (await state(holder, ConfirmState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual({
      text: 'Confirm the change of your delivery address',
      code: '48 21',
      attested: true,
    })
    expect(received.flowId).toBe('f1ow-9')

    await expect(
      holder.modules.confirm.respond({
        threadId: sent.threadId,
        response: { confirmed: true, attestation: { method: 'none', at: new Date().toISOString() } },
      })
    ).rejects.toThrow(/none/)

    const answered = state(service, ConfirmState.ResponseReceived, sent.threadId)
    const at = new Date().toISOString()
    await holder.modules.confirm.respond({
      threadId: sent.threadId,
      response: { confirmed: true, attestation: { method: 'passcode', at } },
    })
    expect((await answered).payload.record.response).toEqual({
      confirmed: true,
      attestation: { method: 'passcode', at },
    })
  })

  it('refuses a request without a code', async () => {
    await expect(
      service.modules.confirm.request({
        connectionId: serviceConnectionId,
        request: { text: 'Confirm', code: '', attested: false },
      })
    ).rejects.toThrow(/code/)
  })
})
