import { JsonTransformer, MessageValidator } from '@credo-ts/core'
import { describe, expect, it } from 'vitest'

import {
  AYNI_FLOW_CLOSE_TYPE,
  AYNI_FLOW_OPEN_TYPE,
  AYNI_FLOW_PROBLEM_REPORT_TYPE,
  AyniFlowCloseMessage,
  AyniFlowErrorCode,
  AyniFlowOpenMessage,
  AyniFlowProblemReportMessage,
} from '../src'

describe('ayni-flow/1.0 messages', () => {
  it('serialises open as the profile §5.1 example', () => {
    const message = new AyniFlowOpenMessage({
      id: 'f1ow-7c2e',
      kind: 'present',
      title: 'Prove you are an Acme employee',
      description: 'Acme Support needs your employee badge to open your ticket.',
      origin: {
        channel: 'ag-ui',
        agentDid: 'did:webvh:acme',
        sessionId: 's_8a1',
        conversationId: 'c_41',
        client: { description: 'Firefox on Linux', platform: 'web' },
      },
      expiresTime: new Date('2026-10-24T15:32:00Z'),
      requires: ['device-authentication'],
      steps: [{ id: '1', kind: 'present', title: 'Your badge' }],
    })

    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': AYNI_FLOW_OPEN_TYPE,
      '@id': 'f1ow-7c2e',
      kind: 'present',
      title: 'Prove you are an Acme employee',
      description: 'Acme Support needs your employee badge to open your ticket.',
      origin: {
        channel: 'ag-ui',
        agentDid: 'did:webvh:acme',
        sessionId: 's_8a1',
        conversationId: 'c_41',
        client: { description: 'Firefox on Linux', platform: 'web' },
      },
      expires_time: '2026-10-24T15:32:00.000Z',
      requires: ['device-authentication'],
      steps: [{ id: '1', kind: 'present', title: 'Your badge' }],
    })
  })

  it('parses an open from the wire, with origin and expires_time typed', () => {
    const message = JsonTransformer.fromJSON(
      {
        '@type': AYNI_FLOW_OPEN_TYPE,
        '@id': 'f1ow-1',
        kind: 'issue',
        title: 'Receive your badge',
        origin: { channel: 'none' },
        expires_time: '2026-10-24T15:32:00Z',
      },
      AyniFlowOpenMessage
    )
    MessageValidator.validateSync(message)

    expect(message.id).toBe('f1ow-1')
    expect(message.origin?.channel).toBe('none')
    expect(message.expiresTime).toBeInstanceOf(Date)
    expect(message.expiresTime?.toISOString()).toBe('2026-10-24T15:32:00.000Z')
  })

  it('parses an open missing its required fields so that the service can refuse it as malformed', () => {
    const message = JsonTransformer.fromJSON(
      { '@type': AYNI_FLOW_OPEN_TYPE, '@id': 'f1ow-2', kind: 'present' },
      AyniFlowOpenMessage
    )
    expect(() => MessageValidator.validateSync(message)).not.toThrow()
    expect(message.title).toBeUndefined()
    expect(message.origin).toBeUndefined()
  })

  it('serialises close with the flow id as ~thread.thid and null reason', () => {
    const message = new AyniFlowCloseMessage({
      id: 'close-1',
      flowId: 'f1ow-7c2e',
      outcome: 'completed',
      references: [{ type: 'credential', id: 'cred-1' }],
    })

    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': AYNI_FLOW_CLOSE_TYPE,
      '@id': 'close-1',
      '~thread': { thid: 'f1ow-7c2e' },
      outcome: 'completed',
      reason: null,
      references: [{ type: 'credential', id: 'cred-1' }],
    })
    expect(message.flowId).toBe('f1ow-7c2e')
  })

  it('rejects a close with an unknown outcome', () => {
    expect(() =>
      JsonTransformer.fromJSON(
        { '@type': AYNI_FLOW_CLOSE_TYPE, '@id': 'c', '~thread': { thid: 'f' }, outcome: 'done' },
        AyniFlowCloseMessage
      )
    ).toThrow(/outcome/)
  })

  it('builds a report-problem 1.0 problem report with pthid = flow id', () => {
    const message = new AyniFlowProblemReportMessage({
      id: 'pr-1',
      flowId: 'f1ow-7c2e',
      threadId: 'req-1',
      description: { code: AyniFlowErrorCode.UnsupportedKind, en: 'no such kind' },
    })

    expect(JsonTransformer.toJSON(message)).toEqual({
      '@type': AYNI_FLOW_PROBLEM_REPORT_TYPE,
      '@id': 'pr-1',
      '~thread': { thid: 'req-1', pthid: 'f1ow-7c2e' },
      description: { code: 'unsupported-kind', en: 'no such kind' },
    })
    expect(AYNI_FLOW_PROBLEM_REPORT_TYPE).toBe('https://didcomm.org/report-problem/1.0/problem-report')
    expect(message.flowId).toBe('f1ow-7c2e')
  })
})
