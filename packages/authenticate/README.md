# @ayni.org/credo-ts-didcomm-authenticate

Credo-TS module for the authenticate/1.0 DIDComm protocol (Ayni Flow Profile 1.0 §6.14, §6.4): a person authenticates
to a service by one accepted combination of methods, on the phone, and enrols an authenticator app or a passkey.

Part of [credo-ts-ayni-flow](../../README.md); the profile is
[`v4/ayni-flow-profile/profile.md`](https://github.com/2060-io/ayni-spec/blob/main/v4/ayni-flow-profile/profile.md)
in `2060-io/ayni-spec`.

```sh
pnpm add @ayni.org/credo-ts-didcomm-authenticate
```

Peer dependencies: `@credo-ts/core` and `@credo-ts/didcomm` on the 0.8.0 line.

Released from this repository's release workflow through npm trusted publishing, with provenance, from 0.2.1 on
(0.2.0 was published by hand, as every first version of a package).

## Roles

`AuthenticateRole.Authenticator` (the Ayni app) and `AuthenticateRole.Requester` (a service), disclosed through
discover-features. A service opens no `authenticate` flow with a holder that did not disclose the protocol, and offers
no `face-match` method to one that did not disclose `calls/1.0` (FLOW-CAP-003).

## An authentication (§6.14)

Inside a flow of kind `authenticate` (`ayni-flow`, fifteen minutes: `AUTHENTICATE_FLOW_EXPIRY_MS`), every message
carrying the flow id as `~thread.pthid`:

| Message | Sent by | API | Record state on the receiver |
|---|---|---|---|
| `request`: `purpose`, `methods`, `combinations`, `text` for a step-up | service | `request()` | `request-received` |
| `choice`: the method names of the combination chosen | holder | `choose()` | `choice-received`, or `failed` (`malformed`) when it is not one of the combinations |
| `step`: a step of the combination chosen, with its `ask` | service | `sendStep()` | `step-received` |
| `answer`: the address and locale, a code or a new code, the consent (`true` or `false`), the passkey's assertion | holder | `answer()` | `answer-received` |
| `step-result`: `passed`, `failed` or `expired`, with a reason | service | `sendStepResult()` | `step-result-received` |

The record keeps the request, the combination chosen (as the request lists it) and the steps in order, each with its
last `step`, its last `answer` and its result. The module holds both sides to the profile:

- a request names a purpose, at least one method, combinations of its methods (none twice); `step-up` and `admin` name
  one set, which may hold confirming methods only (`face-match`, `authenticator-app`); a `step-up` names its action in
  `text`; `connection`, `visitor` and `enrol` combinations each hold an identifying method, and an `enrol` one neither
  an authenticator app nor a passkey;
- a choice is one of the combinations, its names in any order;
- the service runs the identifying methods first, in the order the combination lists them, then the confirming ones,
  each once every step before it passed (FLOW-SIGNIN-008); it sends the current step again for another `ask`, after a
  wrong code (`error: 'wrong-code'`) or to refuse a new code (`error: 'new-code-refused'`, `reason` `too-soon` or
  `no-more`);
- each `ask` carries what it needs (`expires_at`, `tries_left`, `new_codes_left` for an email code; `tries_left` for an
  authenticator app; `challenge` and `rp_id` for a passkey; `text` for a face match's consent), and its answer carries
  its fields and those alone; a consent is `true` on the person's agreement or `false` when the person declines
  (FLOW-SIGNIN-012);
- a `credential`, `document` or `face-match` step after its consent is answered by its carrier (present-proof 2.0,
  mrtd 1.0, calls 1.0) under the flow id, through its own module, never by an `answer`.

### A declined consent

The person may decline the consent of a `face-match` step: the holder answers `consent: false`, and the service ends
the step with `step-result` `outcome: 'failed'`, `reason: 'consent-declined'` (`CONSENT_DECLINED`), and only such a
step with that reason; it neither asks the consent again nor runs the call. The exchange then waits for a new
`choice` on the same request (`record.awaitingChoice`): a combination that holds none of the methods whose consent was
declined (`record.declinedMethods`; `remainingCombinations(request, declinedMethods)` lists them). The service sends
no step until it comes. A second `choice` is accepted only after a `consent-declined` step result; any other fails the
exchange `malformed`, except one that repeats the combination being run (a message delivered twice), which is
ignored.

The record keeps every attempt: `combination` and `steps` are the current one, and `earlierAttempts` the ones before,
oldest first, each `{ combination, steps }` ending with its `consent-declined` step. A step id names a step within its
attempt, so the new attempt may number its steps from `1` again. The five minutes of the choice
(`AUTHENTICATE_CHOICE_TIMEOUT_MS`) run again from the `consent-declined` step result; the flow's fifteen minutes do
not. The host runs both timers.

A malformed message received is recorded `failed` with `errorCode: 'malformed'`; the host sends the flow's problem
report through `ayni-flow`. The module decides nothing the host decides: whether the person's answer is right, whether
the authentication is accepted (the service closes the flow `completed`, or sends a problem report with a reason of
§11), the five minutes of the choice (`AUTHENTICATE_CHOICE_TIMEOUT_MS`, from the request and from each
`consent-declined` step result), the tries and codes left. A refused new code carries its reason in the step
(`error: 'new-code-refused'`, `reason` `too-soon` or `no-more`). The methods of a request have the shape of the peer
status (§4.1): `type`, `credential` for a `credential` method, and `issuers`, the organizations whose credentials are
accepted, absent when any accredited issuer is.

## An enrolment (§6.4)

The holder opens a flow of kind `enrol`, then:

| Message | Sent by | API | Record state on the receiver |
|---|---|---|---|
| `enrol-request`: `type`, `authenticator-app` or `passkey` | holder | `enrol()` | `request-received` |
| `enrol-challenge`: a passkey's `public_key`, or an authenticator app's `secret`, `otpauth_uri`, 6 `digits`, 30 s `period` | service | `sendEnrolChallenge()` | `challenge-received` |
| `enrol-answer`: the passkey's `attestation`, or the six-digit `code` | holder | `answerEnrol()` | `answer-received` |

The `AuthenticateEnrolStateChanged` event of a challenge carries it in full; the records of both sides keep an
authenticator app's challenge without its secret and link. After a wrong code the service sends a new challenge; the
record counts them (`challenges`). An authenticator app's enrolment takes three codes in all
(`ENROL_AUTHENTICATOR_APP_ATTEMPTS`): after the third wrong code the service ends the enrolment `failed`; the module
refuses to send a fourth challenge, and a holder that receives one fails the enrolment `malformed`. Whether a code is
right stays the host's.

`unenrol({ connectionId, type })` (holder) removes an enrolled method, outside any flow; the service hears
`AuthenticateUnenrolReceived` and answers with a peer status whose `enrolled` no longer lists the type.
