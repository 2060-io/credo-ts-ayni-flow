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
    authentication: {
      rule: 'optional',
      methods: {
        badge: { type: 'credential', credential: { jsonSchemaCredentialId: 'https://…/schemas-badge-jsc.json' } },
        email: { type: 'email' },
        face: { type: 'face-match' },
      },
      combinations: [['badge'], ['email', 'face']],
    },
    identified: false,
    open: ['ag-ui'],
  },
})
```

| Field | Values | Meaning |
|---|---|---|
| `authentication.rule` | `none`, `optional`, `required` | nothing asked; an authentication the peer may complete; one it must complete before anything opens |
| `authentication.methods` | name to `{ type, credential?, issuers? }`; absent with `none` | the methods the notifier accepts: `credential`, `email`, `document`, `face-match`, `authenticator-app`, `passkey`; a `credential` method names its schema and, when it accepts only some, the organizations by key |
| `authentication.combinations` | lists of method names; absent with `none` | the accepted combinations: the peer is identified once every method of one completed in one `authenticate` flow |
| `authentication.obtain` | `{ text?, url? }`; absent when the notifier says nothing of it | how the peer obtains what it lacks to authenticate, in the notifier's words |
| `authentication.enrol`, `authentication.enrolled` | `authenticator-app`, `passkey`; to an identified peer only | what the peer may enrol with the notifier (an `enrol` flow, profile §6.4), and what it enrolled |
| `identified` | boolean | whether the notifier holds a valid identity for the peer |
| `open` | names | what the peer may use on the connection now (`ag-ui`; `a2a` and `chat` are reserved) |
| `refusal` | `{ code, comment? }` | the notifier does not serve the peer; `open` is then empty |

On the wire a credential method's schema is `credential.json_schema_credential_id`, as the profile writes it. The
notifier sends only the method types, enrolment types and refusal codes of the profile; the receiver accepts ones it
does not know (more come later) and cannot complete such a method.

The **receiver** gets a `PeerStatusReceived` event and finds the last status of a connection with
`findByConnectionId(connectionId)`, in `received`. A receiver that holds none asks with `query({ connectionId })`:
the notifier's module answers with the status it last sent, and when it has sent none yet, the first one it sends is
the answer.

A receiver that is not identified, with a notifier whose rule is `optional`, asks to authenticate
when the person wishes: `authenticate({ connectionId })`. The notifier gets a `PeerStatusAuthenticateReceived`
event and answers by opening an `authenticate` flow (profile §6.14); the module answers nothing by itself.

Refusal codes: `untrusted`, `not-admitted`, `authentication-declined`, `authentication-unanswered`.

## Roles

`PeerStatusRole.Notifier` and `PeerStatusRole.Receiver`, disclosed through discover-features. The protocol is
symmetric: the Ayni app is a receiver, a service a notifier, and a service that talks to another service holds both,
since each tells the other. One record per connection keeps the two apart: `sent` and `received`.
