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
  PEER_STATUS_AUTHENTICATE_TYPE,
  PEER_STATUS_QUERY_TYPE,
  PEER_STATUS_STATUS_TYPE,
  type PeerStatus,
  PeerStatusAuthenticateMessage,
  type PeerStatusAuthenticateReceivedEvent,
  PeerStatusEventTypes,
  PeerStatusModule,
  type PeerStatusQueryReceivedEvent,
  type PeerStatusReceivedEvent,
  PeerStatusRole,
  PeerStatusStatusMessage,
  validateStatus,
} from '../src'

const BADGE = 'https://ecs.example/vt/schemas-badge-jsc.json'
/** One method, one combination: a badge. */
const badgeOnly = {
  methods: { badge: { type: 'credential', credential: { jsonSchemaCredentialId: BADGE } } },
  combinations: [['badge']],
}
const entered: PeerStatus = {
  authentication: { rule: 'optional', ...badgeOnly },
  identified: false,
  open: ['ag-ui'],
}
const mustIdentify: PeerStatus = {
  authentication: { rule: 'required', ...badgeOnly },
  identified: false,
  open: [],
}
const identified: PeerStatus = { ...mustIdentify, identified: true, open: ['ag-ui'] }
const refused: PeerStatus = {
  ...mustIdentify,
  refusal: { code: 'authentication-declined', comment: 'You declined to authenticate.' },
}
/** The profile §4.1 example: four methods, three combinations, the organizations accepted, how to obtain a badge. */
const offered: PeerStatus = {
  authentication: {
    rule: 'optional',
    methods: {
      badge: { type: 'credential', credential: { jsonSchemaCredentialId: BADGE }, issuers: ['org:EE:12345678'] },
      email: { type: 'email' },
      passport: { type: 'document' },
      face: { type: 'face-match' },
    },
    combinations: [['badge'], ['passport'], ['email', 'face']],
    obtain: { text: 'Ask the Acme front desk for your badge.', url: 'https://acme.example/badge' },
  },
  identified: false,
  open: [],
}
/** An identified person who may enrol a passkey and enrolled an authenticator app (§4.1, §6.4). */
const enrolled: PeerStatus = {
  authentication: {
    rule: 'required',
    methods: { ...offered.authentication.methods, app: { type: 'authenticator-app' }, key: { type: 'passkey' } },
    combinations: [['badge'], ['email', 'app'], ['key']],
    enrol: ['passkey'],
    enrolled: ['authenticator-app'],
  },
  identified: true,
  open: ['ag-ui'],
}

describe('peer-status/1.0 messages', () => {
  it('serialises status as the profile §4.1 example', () => {
    const json = JsonTransformer.toJSON(new PeerStatusStatusMessage({ ...offered, id: 's-1' }))
    expect(json).toEqual({
      '@type': PEER_STATUS_STATUS_TYPE,
      '@id': 's-1',
      authentication: {
        rule: 'optional',
        methods: {
          badge: {
            type: 'credential',
            credential: { json_schema_credential_id: BADGE },
            issuers: ['org:EE:12345678'],
          },
          email: { type: 'email' },
          passport: { type: 'document' },
          face: { type: 'face-match' },
        },
        combinations: [['badge'], ['passport'], ['email', 'face']],
        obtain: { text: 'Ask the Acme front desk for your badge.', url: 'https://acme.example/badge' },
      },
      identified: false,
      open: [],
    })
    expect(JsonTransformer.fromJSON(json, PeerStatusStatusMessage).toStatus()).toEqual(offered)
    // a text alone, or a link alone
    const textOnly = { ...offered, authentication: { ...offered.authentication, obtain: { text: 'At the desk.' } } }
    expect(
      JsonTransformer.fromJSON(
        JsonTransformer.toJSON(new PeerStatusStatusMessage(textOnly)),
        PeerStatusStatusMessage
      ).toStatus()
    ).toEqual(textOnly)
  })

  it('carries what an identified receiver may enrol and has enrolled (§4.1, §6.4)', () => {
    const json = JsonTransformer.toJSON(new PeerStatusStatusMessage({ ...enrolled, id: 's-4' }))
    expect(json.authentication).toMatchObject({ enrol: ['passkey'], enrolled: ['authenticator-app'] })
    expect(json.authentication.methods.key).toEqual({ type: 'passkey' })
    expect(JsonTransformer.fromJSON(json, PeerStatusStatusMessage).toStatus()).toEqual(enrolled)
    expect(validateStatus(enrolled, { strictTypes: true })).toBeUndefined()
  })

  it('carries a refusal, and reads a status back as it was written', () => {
    const json = JsonTransformer.toJSON(new PeerStatusStatusMessage({ ...refused, id: 's-2' }))
    expect(json.refusal).toEqual({
      code: 'authentication-declined',
      comment: 'You declined to authenticate.',
    })
    expect(JsonTransformer.fromJSON(json, PeerStatusStatusMessage).toStatus()).toEqual(refused)
    const none: PeerStatus = { authentication: { rule: 'none' }, identified: false, open: ['ag-ui'] }
    const plain = JsonTransformer.toJSON(new PeerStatusStatusMessage(none))
    expect(plain.authentication).toEqual({ rule: 'none' })
    expect(JsonTransformer.fromJSON(plain, PeerStatusStatusMessage).toStatus()).toEqual(none)
  })

  it('holds the methods and the combinations to the rules of the profile', () => {
    expect(validateStatus(offered, { strictTypes: true })).toBeUndefined()
    const withAuthentication = (authentication: Partial<PeerStatus['authentication']>): PeerStatus => ({
      ...offered,
      authentication: { ...offered.authentication, ...authentication },
    })
    const withBadge = (badge: Record<string, unknown>) =>
      withAuthentication({ methods: { ...offered.authentication.methods, badge: badge as never } })
    expect(validateStatus(withAuthentication({ methods: undefined }))).toMatch(/methods is required/)
    expect(validateStatus(withAuthentication({ methods: {} }))).toMatch(/methods is required/)
    expect(validateStatus(withAuthentication({ combinations: undefined }))).toMatch(/combinations is required/)
    expect(validateStatus(withAuthentication({ combinations: [] }))).toMatch(/combinations is required/)
    expect(validateStatus(withAuthentication({ combinations: [[]] }))).toMatch(/list of method names/)
    expect(validateStatus(withAuthentication({ combinations: [['badge'], ['card']] }))).toMatch(
      /names a method the status does not list/
    )
    expect(validateStatus(withAuthentication({ combinations: [['email', 'email']] }))).toMatch(/names a method twice/)
    expect(
      validateStatus(
        withAuthentication({
          combinations: [
            ['email', 'face'],
            ['face', 'email'],
          ],
        })
      )
    ).toMatch(/listed twice/)
    // a credential method names its schema; the schema and the organizations belong to credential methods alone
    expect(validateStatus(withBadge({ type: 'credential' }))).toMatch(/json_schema_credential_id is required/)
    expect(
      validateStatus(
        withAuthentication({
          methods: {
            ...offered.authentication.methods,
            email: { type: 'email', issuers: ['org:EE:1'] },
          },
        })
      )
    ).toMatch(/issuers is for a credential method only/)
    expect(validateStatus(withBadge({ type: undefined }))).toMatch(/type is required/)
    // a notifier sends the types of the profile; a receiver takes a later one, which it cannot complete
    expect(validateStatus(withBadge({ type: 'retina' }))).toBeUndefined()
    expect(validateStatus(withBadge({ type: 'retina' }), { strictTypes: true })).toMatch(/type must be one of/)
  })

  it('holds the organizations, the way to obtain the credential and the enrolments to the rules of the profile', () => {
    const withBadge = (badge: Record<string, unknown>): PeerStatus => ({
      ...offered,
      authentication: {
        ...offered.authentication,
        methods: {
          ...offered.authentication.methods,
          badge: { ...offered.authentication.methods?.badge, ...badge } as never,
        },
      },
    })
    // no list means any accredited issuer: an empty one would accept nobody
    expect(validateStatus(withBadge({ issuers: [] }))).toMatch(/issuers must be a list/)
    expect(validateStatus(withBadge({ issuers: ['org:EE:1', 'org:EE:1'] }))).toMatch(/key twice/)
    const withAuthentication = (authentication: Partial<PeerStatus['authentication']>): PeerStatus => ({
      ...offered,
      authentication: { ...offered.authentication, ...authentication },
    })
    expect(validateStatus(withAuthentication({ obtain: {} }))).toMatch(/a text, a link, or both/)
    expect(validateStatus(withAuthentication({ obtain: { url: 'http://acme.example' } }))).toMatch(/https link/)
    expect(validateStatus(withAuthentication({ obtain: { url: 'https://acme.example/badge' } }))).toBeUndefined()
    const none: PeerStatus = { authentication: { rule: 'none' }, identified: false, open: ['ag-ui'] }
    expect(validateStatus({ ...none, authentication: { rule: 'none', methods: badgeOnly.methods } })).toMatch(
      /methods is absent with the rule none/
    )
    expect(validateStatus({ ...none, authentication: { rule: 'none', combinations: [['badge']] } })).toMatch(
      /combinations is absent with the rule none/
    )
    expect(validateStatus({ ...none, authentication: { rule: 'none', obtain: { text: 'x' } } })).toMatch(
      /obtain is absent with the rule none/
    )
    // enrol and enrolled go to an identified receiver only, each type once, of the types one may enrol
    expect(validateStatus({ ...enrolled, identified: false, open: [] })).toMatch(/identified receiver only/)
    const withEnrol = (fields: Partial<PeerStatus['authentication']>): PeerStatus => ({
      ...enrolled,
      authentication: { ...enrolled.authentication, ...fields },
    })
    expect(validateStatus(withEnrol({ enrol: ['passkey', 'passkey'] }))).toMatch(/enrol lists a type twice/)
    expect(validateStatus(withEnrol({ enrolled: [''] }))).toMatch(/enrolled must be a list of method types/)
    expect(validateStatus(withEnrol({ enrol: ['email'] }))).toBeUndefined()
    expect(validateStatus(withEnrol({ enrol: ['email'] }), { strictTypes: true })).toMatch(
      /enrol lists only authenticator-app, passkey/
    )
  })

  it('asks to authenticate with a message that has no body', () => {
    expect(JsonTransformer.toJSON(new PeerStatusAuthenticateMessage({ id: 'a-1' }))).toEqual({
      '@type': PEER_STATUS_AUTHENTICATE_TYPE,
      '@id': 'a-1',
    })
  })

  it('holds a status to the rules of the profile', () => {
    expect(validateStatus(entered)).toBeUndefined()
    expect(validateStatus(refused, { strictRefusal: true })).toBeUndefined()
    expect(validateStatus({ ...entered, authentication: { rule: 'sometimes' as never } })).toMatch(
      /rule must be one of/
    )
    expect(validateStatus({ ...entered, open: ['ag-ui', 'ag-ui'] })).toMatch(/twice/)
    expect(validateStatus({ ...refused, open: ['ag-ui'] })).toMatch(/empty with a refusal/)
    // a notifier sends the codes of the profile; a receiver takes one it does not know
    const later = { ...refused, refusal: { code: 'a-later-code' } }
    expect(validateStatus(later)).toBeUndefined()
    expect(validateStatus(later, { strictRefusal: true })).toMatch(/refusal.code must be one of/)
  })
})

const modules = (roles: PeerStatusRole[]) => ({ peerStatus: new PeerStatusModule({ roles }) })

describe('peer-status/1.0 between a service and a holder', () => {
  const network = new SubjectNetwork()
  let service: TestAgent<ReturnType<typeof modules>>
  let holder: TestAgent<ReturnType<typeof modules>>
  let serviceConnectionId: string
  let holderConnectionId: string

  beforeAll(async () => {
    service = createTestAgent({ name: 'service', network, modules: modules([PeerStatusRole.Notifier]) })
    holder = createTestAgent({ name: 'holder', network, modules: modules([PeerStatusRole.Receiver]) })
    await service.initialize()
    await holder.initialize()
    const [s, h] = await makeConnection(service, holder)
    serviceConnectionId = s.id
    holderConnectionId = h.id
  })

  afterAll(async () => {
    await holder.shutdown()
    await service.shutdown()
  })

  it('answers no query before it has decided: the first status is the answer', async () => {
    const asked = waitForEvent<PeerStatusQueryReceivedEvent>(service, PeerStatusEventTypes.PeerStatusQueryReceived)
    await holder.modules.peerStatus.query({ connectionId: holderConnectionId })
    expect((await asked).payload).toMatchObject({ connectionId: serviceConnectionId, answered: false })
    expect(await holder.modules.peerStatus.findByConnectionId(holderConnectionId)).toBeNull()
  })

  it('delivers the status, which the holder keeps as the status of the connection', async () => {
    const received = waitForEvent<PeerStatusReceivedEvent>(holder, PeerStatusEventTypes.PeerStatusReceived)
    const { messageId } = await service.modules.peerStatus.send({
      connectionId: serviceConnectionId,
      status: mustIdentify,
    })
    const { payload } = await received
    expect(payload).toEqual({ connectionId: holderConnectionId, status: mustIdentify, previous: undefined, messageId })
    const kept = await holder.modules.peerStatus.findByConnectionId(holderConnectionId)
    expect(kept?.received).toEqual(mustIdentify)
    expect(Date.parse(kept?.receivedAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
    expect(kept?.sent).toBeUndefined()
    expect((await service.modules.peerStatus.findByConnectionId(serviceConnectionId))?.sent).toEqual(mustIdentify)
  })

  it('replaces the status before it: the last one rules', async () => {
    const received = waitForEvent<PeerStatusReceivedEvent>(holder, PeerStatusEventTypes.PeerStatusReceived)
    await service.modules.peerStatus.send({ connectionId: serviceConnectionId, status: identified })
    const { payload } = await received
    expect(payload.previous).toEqual(mustIdentify)
    expect(payload.status).toEqual(identified)
    expect((await holder.modules.peerStatus.findByConnectionId(holderConnectionId))?.received).toEqual(identified)
  })

  it('tells an identified person what it may enrol and has enrolled, and refuses to send enrolments to a visitor (FLOW-SIGNIN-014)', async () => {
    const received = waitForEvent<PeerStatusReceivedEvent>(holder, PeerStatusEventTypes.PeerStatusReceived)
    await service.modules.peerStatus.send({ connectionId: serviceConnectionId, status: enrolled })
    expect((await received).payload.status).toEqual(enrolled)
    await expect(
      service.modules.peerStatus.send({
        connectionId: serviceConnectionId,
        status: { ...enrolled, identified: false, open: [] },
      })
    ).rejects.toThrow(/identified receiver only/)
    await expect(
      service.modules.peerStatus.send({
        connectionId: serviceConnectionId,
        status: { ...enrolled, authentication: { ...enrolled.authentication, enrol: ['email'] } },
      })
    ).rejects.toThrow(/enrol lists only/)
    // back to the status the next test asks for
    const again = waitForEvent<PeerStatusReceivedEvent>(holder, PeerStatusEventTypes.PeerStatusReceived)
    await service.modules.peerStatus.send({ connectionId: serviceConnectionId, status: identified })
    await again
  })

  it('answers a query with the status it last sent', async () => {
    const asked = waitForEvent<PeerStatusQueryReceivedEvent>(service, PeerStatusEventTypes.PeerStatusQueryReceived)
    const received = waitForEvent<PeerStatusReceivedEvent>(holder, PeerStatusEventTypes.PeerStatusReceived)
    await holder.modules.peerStatus.query({ connectionId: holderConnectionId })
    expect((await asked).payload.answered).toBe(true)
    expect((await received).payload.status).toEqual(identified)
  })

  it('refuses to send a status that breaks a rule, and a role it does not hold', async () => {
    await expect(
      service.modules.peerStatus.send({ connectionId: serviceConnectionId, status: { ...refused, open: ['ag-ui'] } })
    ).rejects.toThrow(/empty with a refusal/)
    await expect(
      service.modules.peerStatus.send({
        connectionId: serviceConnectionId,
        status: { ...refused, refusal: { code: 'because' } },
      })
    ).rejects.toThrow(/refusal.code must be one of/)
    await expect(holder.modules.peerStatus.send({ connectionId: holderConnectionId, status: entered })).rejects.toThrow(
      /not a notifier/
    )
    await expect(service.modules.peerStatus.query({ connectionId: serviceConnectionId })).rejects.toThrow(
      /not a receiver/
    )
  })

  it('carries the request of a guest to authenticate: the service hears of it and answers nothing by itself (FLOW-STAT-009)', async () => {
    const asked = waitForEvent<PeerStatusAuthenticateReceivedEvent>(
      service,
      PeerStatusEventTypes.PeerStatusAuthenticateReceived
    )
    const { messageId } = await holder.modules.peerStatus.authenticate({ connectionId: holderConnectionId })
    expect((await asked).payload).toEqual({ connectionId: serviceConnectionId, messageId })
    // a service does not ask to authenticate to a holder: the role is the receiver's
    await expect(service.modules.peerStatus.authenticate({ connectionId: serviceConnectionId })).rejects.toThrow(
      /not a receiver/
    )
  })

  it('forgets the statuses of a connection that ended', async () => {
    await holder.modules.peerStatus.deleteByConnectionId(holderConnectionId)
    expect(await holder.modules.peerStatus.findByConnectionId(holderConnectionId)).toBeNull()
  })
})

describe('peer-status/1.0 between two services (FLOW-STAT-008)', () => {
  const network = new SubjectNetwork()
  const both = [PeerStatusRole.Notifier, PeerStatusRole.Receiver]
  let one: TestAgent<ReturnType<typeof modules>>
  let other: TestAgent<ReturnType<typeof modules>>
  let oneConnectionId: string
  let otherConnectionId: string

  beforeAll(async () => {
    one = createTestAgent({ name: 'one', network, modules: modules(both) })
    other = createTestAgent({ name: 'other', network, modules: modules(both) })
    await one.initialize()
    await other.initialize()
    const [a, b] = await makeConnection(one, other)
    oneConnectionId = a.id
    otherConnectionId = b.id
  })

  afterAll(async () => {
    await other.shutdown()
    await one.shutdown()
  })

  it('lets each side tell the other, and keeps the two statuses apart', async () => {
    const welcome: PeerStatus = { authentication: { rule: 'none' }, identified: true, open: ['a2a'] }
    const closed: PeerStatus = {
      authentication: { rule: 'none' },
      identified: false,
      open: [],
      refusal: { code: 'untrusted' },
    }
    const atOther = waitForEvent<PeerStatusReceivedEvent>(other, PeerStatusEventTypes.PeerStatusReceived)
    const atOne = waitForEvent<PeerStatusReceivedEvent>(one, PeerStatusEventTypes.PeerStatusReceived)
    await one.modules.peerStatus.send({ connectionId: oneConnectionId, status: welcome })
    await other.modules.peerStatus.send({ connectionId: otherConnectionId, status: closed })
    expect((await atOther).payload.status).toEqual(welcome)
    expect((await atOne).payload.status).toEqual(closed)
    const record = await one.modules.peerStatus.findByConnectionId(oneConnectionId)
    expect(record?.sent).toEqual(welcome)
    expect(record?.received).toEqual(closed)
  })

  it('uses the two message types of the protocol', () => {
    expect(PEER_STATUS_STATUS_TYPE).toBe('https://didcomm.org/peer-status/1.0/status')
    expect(PEER_STATUS_QUERY_TYPE).toBe('https://didcomm.org/peer-status/1.0/query')
  })
})
