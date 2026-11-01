# credo-ts-ayni-flow

Credo-TS DIDComm modules for the **Ayni Flow Profile 1.0**: the `ayni-flow/1.0` envelope and the seven carrier
protocols the profile introduces. One published package per protocol, usable by VS Agent (Node) and by the Ayni app
(React Native) alike, on the Credo-TS line both pin.

The profile is normative: [`v4/ayni-flow-profile/profile.md`](https://github.com/2060-io/ayni-spec/blob/main/v4/ayni-flow-profile/profile.md)
in `2060-io/ayni-spec`. Each package names the sections and the `FLOW-*` requirements it implements.

## Packages

| Package | Protocol | Profile | Roles (holder / service) |
|---------|----------|---------|--------------------------|
| [`@ayni.org/credo-ts-didcomm-ayni-flow`](packages/ayni-flow) | `https://didcomm.org/ayni-flow/1.0` | §5, §11 | `holder` / `service` |
| [`@ayni.org/credo-ts-didcomm-authorize`](packages/authorize) | `https://didcomm.org/authorize/1.0` | §6.5 | `approver` / `requester` |
| [`@ayni.org/credo-ts-didcomm-confirm`](packages/confirm) | `https://didcomm.org/confirm/1.0` | §6.6 | `confirmer` / `requester` |
| [`@ayni.org/credo-ts-didcomm-link-session`](packages/link-session) | `https://didcomm.org/link-session/1.0` | §6.7 | `holder` / `agent` |
| [`@ayni.org/credo-ts-didcomm-session-grant`](packages/session-grant) | `https://didcomm.org/session-grant/1.0` | §6.8 | `requester` / `agent` |
| [`@ayni.org/credo-ts-didcomm-sign-tx`](packages/sign-tx) | `https://didcomm.org/sign-tx/1.0` | §6.9 | `signer` / `requester` |
| [`@ayni.org/credo-ts-didcomm-notify`](packages/notify) | `https://didcomm.org/notify/1.0` | §6.10 | `receiver` / `sender` |
| [`@ayni.org/credo-ts-didcomm-reissue`](packages/reissue) | `https://didcomm.org/reissue/1.0` | §6.11 | `requester` / `issuer` |

The kinds `present`, `issue`, `nfc-read`, `call` and `revoked` ride on protocols Credo and
[`openwallet-foundation/credo-ts-didcomm-ext`](https://github.com/openwallet-foundation/credo-ts-didcomm-ext) already
provide (present-proof 2.0, issue-credential 2.0, mrtd 1.0, calls 1.0, revocation_notification 2.0); set
`parentThreadId` to the flow id when you send them and the `ayni-flow` module groups them into the flow.

## Credo-TS line

The packages run on the Credo-TS **0.8.0 PR 2704 snapshot line** (`@credo-ts/core` and `@credo-ts/didcomm`
`0.8.0-pr-2704-*`), the one VS Agent and the Ayni app pin; the exact snapshot the repo tests against is in
[`pnpm-workspace.yaml`](pnpm-workspace.yaml) (`catalog`). The peer dependency range accepts any snapshot of that line
from 2026-10-26 on, and the 0.8.0 release once Credo publishes it. DIDComm v1 only.

## Usage

```ts
import { AyniFlowModule, AyniFlowRole } from '@ayni.org/credo-ts-didcomm-ayni-flow'
import { AuthorizeModule, AuthorizeRole } from '@ayni.org/credo-ts-didcomm-authorize'

// a Verifiable Service (VS Agent)
const agent = new Agent({
  modules: {
    didcomm: new DidCommModule({ /* ... */ }),
    ayniFlow: new AyniFlowModule({ role: AyniFlowRole.Service }),
    authorize: new AuthorizeModule({ roles: [AuthorizeRole.Requester] }),
  },
})

// open a flow, run the carrier protocol inside it, close it
const flow = await agent.modules.ayniFlow.openFlow({
  connectionId,
  kind: 'authorize',
  title: 'Ana asks for your approval',
  origin: { channel: 'ag-ui', agentDid, sessionId, conversationId, client: { description: 'Firefox on Linux', platform: 'web' } },
  expiresTime: new Date(Date.now() + 10 * 60_000),
})
const exchange = await agent.modules.authorize.request({
  connectionId,
  parentThreadId: flow.flowId,
  request: { requester: { name: 'Ana Ruiz', role: 'Analyst' }, purpose: { id: 'customer-support', label: 'Customer support' },
             justification: 'Ticket 4411 needs the customer address.', scope: ['tool:crm.readCustomer'],
             expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), attested: true },
})
// ... on AuthorizeStateChanged with state response-received:
await agent.modules.ayniFlow.closeFlow({ flowId: flow.flowId, outcome: 'completed' })
```

Every module emits one Credo event type (`<Protocol>StateChanged`, or `NotifyNotificationReceived`) carrying the record;
the host reacts to those rather than to raw messages. Records are queryable through each API (`findByFlowId`,
`findAllByQuery`...).

### What `ayni-flow` does for you

- records every flow on both ends (the holder's History entry of §5.3), `pending` on `open`, `active` on the first
  carrier message sent or received with the flow's `pthid`, then the `close` outcome;
- refuses an `open` with a report-problem 1.0 `malformed`, `expired`, `unsupported-kind` or `too-many-flows`
  (FLOW-CORE-002/004/008); the kinds a holder answers and the pending limit are module options;
- closes the flow `failed` on a problem report with `~thread.pthid` (FLOW-ERR-001) and lets you send one
  (`sendProblemReport`) with the codes of §11;
- enforces `expires_time` (FLOW-CORE-004): a message of an expired flow closes it and is dropped; `expireDueFlows()`
  (or the optional `expiryCheckIntervalMs` timer) closes the others;
- drops every inbound message that carries the `pthid` of a closed flow (FLOW-CORE-005);
- ignores replays (FLOW-SEC-003).

### What the carrier modules do

Each one builds and parses the wire messages of its section, validates them against the profile's rules on both ends
(an attestation `none` on an attested request, a grant beyond sixty seconds, a `sign-tx` status that contradicts
`broadcast`...), keeps one record per exchange with `threadId` (the request id) and `parentThreadId` (the flow id), and
discloses the protocol with the roles you configure. A malformed message received is recorded `failed` with
`errorCode: 'malformed'`; the host then sends the flow's problem report through `ayni-flow`.

## Design notes

- **Problem reports** use `https://didcomm.org/report-problem/1.0/problem-report` as the profile requires, not Credo's
  legacy `notification/1.0` URI; `AyniFlowProblemReportMessage` is the class to send and the one the handler keys on.
- **Dates** cross the APIs as ISO 8601 strings inside request and response bodies (so that records serialise without
  loss) and as `Date` for the flow's `expiresTime`.
- **Nullable fields** of the profile's examples (`conversation_id`, `tx_hash`, `codes`, `comment`, `reason`...) are
  written as explicit `null` when unset.
- **`sign-tx` `reason`**: the profile says a request the chain refuses "is answered `failed` with the chain's reason"
  without naming a field; the response carries it as `reason`, pending the profile naming it.
- **`session-grant`**: the agent side refuses to send a grant valid for more than sixty seconds; the holder side tolerates
  thirty seconds of clock skew when it checks a received one.
- **`notify`** keeps no record: one message, one event.
- **`reissue`** has no response message; `markAnswered` records on either side that an `issue` flow or a problem report
  answered the request.

## Development

```sh
pnpm install
pnpm build          # tsdown, every package
pnpm check-format   # biome
pnpm check-types    # tsc, packages and tests
pnpm test           # vitest: wire-format tests and two-agent exchanges over in-memory transports
```

Tests spin up two Credo agents with in-memory Askar stores connected over rxjs transports (`packages/test-utils`, not
published) and run every protocol end to end.

The six request/response packages (`authorize`, `confirm`, `link-session`, `session-grant`, `sign-tx`, `reissue`) share
one shape. Their module, config, API, record, repository, service, handlers and manifests are generated from
[`scripts/generate-protocol-package.py`](scripts/generate-protocol-package.py); only `src/fields.ts`, the message classes
and `src/validation.ts` are written by hand. Change the template, run the script, never edit a generated file.

## Releasing

[release-please](https://github.com/googleapis/release-please) opens one release PR per package from the conventional
commits that touched it; merging it tags `<package>@vX.Y.Z` and the [release workflow](.github/workflows/release.yml)
publishes to npm with provenance through **trusted publishing** (OIDC): each npm package must list this repository and
`release.yml` as a trusted publisher. No token secret is stored.

## License

Apache-2.0
