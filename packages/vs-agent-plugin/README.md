# @ayni.org/vs-agent-plugin-ayni-flow

A [VS Agent](https://github.com/verana-labs/vs-agent) plugin that serves the **Ayni Flow Profile 1.0** to the Ayni
app: the `ayni-flow/1.0` envelope and its carrier protocols (`authorize`, `confirm`, `link-session`, `session-grant`,
`sign-tx`, `notify`, `reissue`) as Credo modules, their Admin API v2 routes, message routing and webhook events. It
implements CC-VSA-005, CC-VSA-007 and CC-VSA-010 of `2060-io/ayni-spec` `v4/companion-changes.md`.

## Install into a VS Agent image

```dockerfile
FROM veranalabs/vs-agent:<version with the plugin loader>
RUN pnpm add @ayni.org/vs-agent-plugin-ayni-flow@<version>
```

```yaml
env:
  VS_AGENT_PLUGIN_PACKAGES: "@ayni.org/vs-agent-plugin-ayni-flow"   # loaded by VS Agent's generic plugin loader
  AYNI_FLOW_SIDE: "service"                                          # default; `holder` for tests and tooling
```

and `https://didcomm.org/ayni-flow/*` in `discovery.json`, so that VS Agent queries each new peer for flow
support (FLOW-CAP-002); the disclosure arrives on the existing connection event.

## Releases

The package is published from this repository's release workflow through npm trusted publishing, with a provenance
statement: no publish token exists. To check that an installed version was built here:

```sh
npm view @ayni.org/vs-agent-plugin-ayni-flow dist.attestations
npm audit signatures
```

## Admin API (v2)

| Route | Does |
|-------|------|
| `POST /v2/didcomm/ayni-flow/flows` | open a flow; returns `flowId` |
| `GET /v2/didcomm/ayni-flow/flows[/{flowId}]` | list or read flows |
| `POST /v2/didcomm/ayni-flow/flows/{flowId}/close` | close with `outcome`, `reason`, `references` |
| `POST /v2/didcomm/ayni-flow/flows/{flowId}/problem-report` | refuse or fail with a §11 code |
| `POST /v2/didcomm/authorize`, `/confirm`, `/link-session`, `/sign-tx` | send the request (`flowId` sets `~thread.pthid`) |
| `POST /v2/didcomm/{protocol}/{threadId}/response` | answer a received request |
| `POST /v2/didcomm/session-grant/{threadId}/grant` | answer a session-grant request |
| `POST /v2/didcomm/reissue/{threadId}/answered` | record that a reissue was answered |
| `POST /v2/didcomm/notify` | send a notification |
| `POST /v2/didcomm/revocation-notification` | send `revocation_notification/2.0/revoke` |
| `GET /v2/didcomm/{protocol}[/{threadId}]`, `POST .../{threadId}/fail` | read exchanges, record a controller-side failure |

## Webhook events

`didcomm.ayni-flow.state-changed` (the flow DTO plus `previousState`; a peer's problem report arrives as `state:
failed` with `errorCode` and `closedBy: peer`), `didcomm.{authorize,confirm,link-session,session-grant,sign-tx,
reissue}.state-changed` (the exchange DTO plus `previousState`), `didcomm.notify.notification-received`.

## In code

```ts
import { createVsAgent, setupBaseDidComm } from '@verana-labs/vs-agent-sdk'
import { setupAyniFlowProtocols } from '@ayni.org/vs-agent-plugin-ayni-flow'

const agent = createVsAgent({ plugins: [setupBaseDidComm(options), setupAyniFlowProtocols({ side: 'service' })], ... })
```
