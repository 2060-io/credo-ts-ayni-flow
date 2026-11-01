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
  SIGN_TX_REQUEST_TYPE,
  SIGN_TX_RESPONSE_TYPE,
  SignTxEventTypes,
  SignTxModule,
  SignTxRequestMessage,
  SignTxResponseMessage,
  SignTxRole,
  SignTxState,
  type SignTxStateChangedEvent,
} from '../src'

const request = {
  chainId: 'vna-testnet-1',
  signDoc: { bodyBytes: 'Ym9keQ==', authInfoBytes: 'YXV0aA==', accountNumber: '1203' },
  summary: { amount: '150000 uvna', to: 'verana1abc', memo: 'Order 8812' },
  broadcast: 'service' as const,
}

describe('sign-tx/1.0 messages', () => {
  it('serialises request and response as the profile §6.9 example', () => {
    const message = new SignTxRequestMessage({ ...request, id: 'req-1', parentThreadId: 'f1ow-1' })
    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': SIGN_TX_REQUEST_TYPE,
      '@id': 'req-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-1' },
      chain_id: 'vna-testnet-1',
      sign_doc: { body_bytes: 'Ym9keQ==', auth_info_bytes: 'YXV0aA==', account_number: '1203' },
      summary: { amount: '150000 uvna', to: 'verana1abc', memo: 'Order 8812' },
      broadcast: 'service',
    })

    const response = new SignTxResponseMessage({
      id: 'res-1',
      threadId: 'req-1',
      signature: 'c2ln',
      publicKey: { type: 'secp256k1', value: 'cGs=' },
      status: 'signed',
    })
    expect(JsonTransformer.toJSON(response)).toEqual({
      '@type': SIGN_TX_RESPONSE_TYPE,
      '@id': 'res-1',
      '~thread': { thid: 'req-1' },
      signature: 'c2ln',
      public_key: { type: 'secp256k1', value: 'cGs=' },
      tx_hash: null,
      status: 'signed',
      reason: null,
    })
  })
})

const modules = (roles: SignTxRole[]) => ({ signTx: new SignTxModule({ roles }) })

describe('sign-tx/1.0 between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let serviceConnectionId: string

  const state = (a: TestAgent<any>, s: SignTxState, threadId?: string) =>
    waitForEvent<SignTxStateChangedEvent>(
      a,
      SignTxEventTypes.SignTxStateChanged,
      (e) => e.payload.record.state === s && (!threadId || e.payload.record.threadId === threadId)
    )

  beforeAll(async () => {
    service = createTestAgent({ name: 'svc', network, modules: modules([SignTxRole.Requester]) })
    holder = createTestAgent({ name: 'hld', network, modules: modules([SignTxRole.Signer]) })
    await service.initialize()
    await holder.initialize()
    const [c] = await makeConnection(service, holder)
    serviceConnectionId = c.id
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('signs for the service to broadcast', async () => {
    const sent = await service.modules.signTx.request({ connectionId: serviceConnectionId, request })
    const received = (await state(holder, SignTxState.RequestReceived, sent.threadId)).payload.record
    expect(received.request).toEqual(request)

    await expect(
      holder.modules.signTx.respond({ threadId: sent.threadId, response: { status: 'signed' } })
    ).rejects.toThrow(/signature/)
    await expect(
      holder.modules.signTx.respond({
        threadId: sent.threadId,
        response: { status: 'broadcast', signature: 's', publicKey: { type: 'secp256k1', value: 'p' }, txHash: 'h' },
      })
    ).rejects.toThrow(/broadcast: app/)

    const answered = state(service, SignTxState.ResponseReceived, sent.threadId)
    await holder.modules.signTx.respond({
      threadId: sent.threadId,
      response: { status: 'signed', signature: 'c2ln', publicKey: { type: 'secp256k1', value: 'cGs=' } },
    })
    expect((await answered).payload.record.response).toEqual({
      status: 'signed',
      signature: 'c2ln',
      publicKey: { type: 'secp256k1', value: 'cGs=' },
      txHash: null,
      reason: null,
    })
  })

  it('answers failed with the chain reason, and refuses a malformed sign_doc', async () => {
    const sent = await service.modules.signTx.request({
      connectionId: serviceConnectionId,
      request: { ...request, broadcast: 'app' },
    })
    await state(holder, SignTxState.RequestReceived, sent.threadId)
    const answered = state(service, SignTxState.ResponseReceived, sent.threadId)
    await holder.modules.signTx.respond({
      threadId: sent.threadId,
      response: { status: 'failed', reason: 'account sequence mismatch, expected 12, got 11' },
    })
    expect((await answered).payload.record.response?.reason).toMatch(/sequence/)

    await expect(
      service.modules.signTx.request({
        connectionId: serviceConnectionId,
        request: { ...request, signDoc: { ...request.signDoc, accountNumber: 'twelve' } },
      })
    ).rejects.toThrow(/account_number/)
  })
})
