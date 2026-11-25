# @ayni.org/credo-ts-didcomm-reissue

Credo-TS module for the reissue/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.11): the holder asks an issuer to issue a credential again, after a restore or when its wallet holds none; the issuer answers with an issue flow or a problem report.

Part of [credo-ts-ayni-flow](../../README.md); the profile is
[`v4/ayni-flow-profile/profile.md`](https://github.com/2060-io/ayni-spec/blob/main/v4/ayni-flow-profile/profile.md)
in `2060-io/ayni-spec`.

```sh
pnpm add @ayni.org/credo-ts-didcomm-reissue
```

Peer dependencies: `@credo-ts/core` and `@credo-ts/didcomm` on the 0.8.0 PR 2704 snapshot line.

## Asking

The holder asks with `request`, inside the `reissue` flow it opened (`parentThreadId`, the flow id). The `reason`
decides what the `reference` names:

| `reason` | `reference` | When |
|---|---|---|
| `restore` | `credentialId`, `schemaId`, `credDefId`, `issuedAt`, from the backup's credential reference | after a restore, for a credential the backup names |
| `missing` | `jsonSchemaCredentialId` alone | the wallet holds no credential of a schema the issuer lists in `issuable` of its last peer status (profile §4.1) |

```ts
// after a restore
await agent.modules.reissue.request({
  connectionId,
  parentThreadId: flowId,
  request: {
    reference: { credentialId, schemaId, credDefId, issuedAt: '2026-03-02T10:00:00Z' },
    reason: 'restore',
  },
})

// the wallet holds no badge of the issuer: one entry of the peer status's `issuable`
await agent.modules.reissue.request({
  connectionId,
  parentThreadId: flowId,
  request: { reference: { jsonSchemaCredentialId: issuable.jsonSchemaCredentialId }, reason: 'missing' },
})
```

On the wire the reference is snake_case (`credential_id`, `schema_id`, `cred_def_id`, `issued_at`,
`json_schema_credential_id`). A request that lacks what its reason needs is refused before it is sent, and recorded
`failed` (`malformed`) when it is received.

The issuer gets a `ReissueStateChanged` event with the record in `request-received`, `record.request` as sent. It
answers with an `issue` flow, or with a problem report `not-eligible`, `unknown-reference` or `unavailable` (it cannot
issue it now: the holder may ask again later), and records the outcome with `markAnswered(threadId)` or
`fail(threadId, code, description)`. The holder does the same when the answer arrives.
