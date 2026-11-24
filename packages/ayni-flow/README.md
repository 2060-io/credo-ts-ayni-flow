# @ayni.org/credo-ts-didcomm-ayni-flow

Credo-TS module for the ayni-flow/1.0 DIDComm protocol (Ayni Flow Profile 1.0): the flow envelope that groups carrier protocol messages by ~thread.pthid.

Part of [credo-ts-ayni-flow](../../README.md); the profile is
[`v4/ayni-flow-profile/profile.md`](https://github.com/2060-io/ayni-spec/blob/main/v4/ayni-flow-profile/profile.md)
in `2060-io/ayni-spec`.

```sh
pnpm add @ayni.org/credo-ts-didcomm-ayni-flow
```

Peer dependencies: `@credo-ts/core` and `@credo-ts/didcomm` on the 0.8.0 PR 2704 snapshot line.

## The `open`

`openFlow()` sends `ayni-flow/1.0/open` with `kind`, `title`, `origin` and `expires_time`, and optionally
`description`, `link` (an app link the holder offers on the request's sheet, FLOW-CORE-011) and `steps`. An `open`
carries no `requires`: the profile retired it (FLOW-CORE-010), and the phone's own authentication is asked per
protocol (`attested` on `authorize` and `confirm`; always for `sign-tx`, presentations and passkeys).
