# @ayni.org/credo-ts-didcomm-peer-status

Credo-TS module for the peer-status/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §4.1): a party tells its peer how it identifies it, whether it is identified and what is open to it.

Part of [credo-ts-ayni-flow](../../README.md); the profile is
[`v4/ayni-flow-profile/profile.md`](https://github.com/2060-io/ayni-spec/blob/main/v4/ayni-flow-profile/profile.md)
in `2060-io/ayni-spec`.

```sh
pnpm add @ayni.org/credo-ts-didcomm-peer-status
```

Peer dependencies: `@credo-ts/core` and `@credo-ts/didcomm` on the 0.8.0 PR 2704 snapshot line.

## What it carries

A connection that completes says nothing of what its peer may do on it. The **notifier** says it, in one message
that replaces the one before:

```ts
await agent.modules.peerStatus.send({
  connectionId,
  status: {
    authentication: { rule: 'optional', credential: { jsonSchemaCredentialId: 'https://…/schemas-badge-jsc.json' } },
    identified: false,
    open: ['ag-ui'],
  },
})
```

| Field | Values | Meaning |
|---|---|---|
| `authentication.rule` | `none`, `optional`, `required` | nothing asked; a credential the peer may present; one it must present before anything opens |
| `authentication.credential` | the schema asked for; absent with `none` | which credential identifies the peer |
| `authentication.issuers` | organization keys; absent when any accredited issuer is accepted | the organizations whose credentials the notifier accepts |
| `authentication.obtain` | `{ text?, url? }`; absent when the notifier says nothing of it | how the peer obtains a credential the notifier accepts, in the notifier's words |
| `identified` | boolean | whether the notifier holds a valid identity for the peer |
| `open` | names | what the peer may use on the connection now (`ag-ui`; `a2a` and `chat` are reserved) |
| `refusal` | `{ code, comment? }` | the notifier does not serve the peer; `open` is then empty |

The **receiver** gets a `PeerStatusReceived` event and finds the last status of a connection with
`findByConnectionId(connectionId)`, in `received`. A receiver that holds none asks with `query({ connectionId })`:
the notifier's module answers with the status it last sent, and when it has sent none yet, the first one it sends is
the answer.

A receiver that is not identified, with a notifier whose rule is `optional`, asks to be asked for its credential
when the person wishes: `authenticate({ connectionId })`. The notifier gets a `PeerStatusAuthenticateReceived`
event and answers by opening an `authenticate` flow (profile §6.14); the module answers nothing by itself.

Refusal codes: `untrusted`, `not-admitted`, `authentication-declined`, `authentication-unanswered`.

## Roles

`PeerStatusRole.Notifier` and `PeerStatusRole.Receiver`, disclosed through discover-features. The protocol is
symmetric: the Ayni app is a receiver, a service a notifier, and a service that talks to another service holds both,
since each tells the other. One record per connection keeps the two apart: `sent` and `received`.
