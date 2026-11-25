# Changelog

## [0.4.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.3.2...credo-ts-didcomm-authenticate@v0.4.0) (2026-11-25)


### ⚠ BREAKING CHANGES

* **authenticate:** an `answer` may carry `consent: false`, which a service must end with a `step-result` `failed` `consent-declined` (`sendStepResult` refuses any other result for that step, and `sendStep` refuses to ask it again); after it the exchange waits for a new `choice` and `sendStep` refuses until it comes. A second `choice` that does not follow a `consent-declined` step result now fails the exchange `malformed` instead of being ignored (a repeat of the current combination is still ignored). `validateAnswer` accepts `consent: false`, `validateStepResult` takes the step it ends, and `createChoice` throws unless a choice is awaited. A fourth `enrol-challenge` of an authenticator app is refused on the service and fails the enrolment on the holder.

### Features

* **authenticate:** a person may decline the face-match consent and choose another combination ([15580cd](https://github.com/2060-io/credo-ts-ayni-flow/commit/15580cdc0be09f3fbfca809e8a9514f55fb51cf6))
* **authenticate:** authenticate/1.0, an authentication by one accepted combination of methods and the enrolment of an authenticator app or a passkey ([055bc0d](https://github.com/2060-io/credo-ts-ayni-flow/commit/055bc0d53a4c01ea24ac7e8077ec4f63811a01f8))


### Bug Fixes

* **authenticate:** an enrol-challenge sent again after a wrong code carries error and tries_left ([5c89338](https://github.com/2060-io/credo-ts-ayni-flow/commit/5c89338205ccf4b8ea959a9dc0a33d3b7e02293e))
* **authenticate:** an enrol-challenge sent again after a wrong code carries error and tries_left ([1416bf7](https://github.com/2060-io/credo-ts-ayni-flow/commit/1416bf7a0b12a6bc66843ae8b079e08c7ae3ace5))
* **release:** a publish job repeated once its version is on npm ends without error; 0.2.1, the authenticate package's first release through trusted publishing ([70c6a7a](https://github.com/2060-io/credo-ts-ayni-flow/commit/70c6a7ae65e5660ea50775f270e517f24e67ac86))
* **release:** a repeated publish job ends without error once its version is on npm; release 0.2.1 ([f56bc91](https://github.com/2060-io/credo-ts-ayni-flow/commit/f56bc917a88311623db1858536c3701813eef575))

## [0.3.2](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.3.1...credo-ts-didcomm-authenticate@v0.3.2) (2026-11-25)


### Miscellaneous Chores

* **credo-ts-didcomm-authenticate:** Synchronize ayni-flow versions

## [0.3.1](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.3.0...credo-ts-didcomm-authenticate@v0.3.1) (2026-11-24)


### Bug Fixes

* **authenticate:** an enrol-challenge sent again after a wrong code carries error and tries_left ([5c89338](https://github.com/2060-io/credo-ts-ayni-flow/commit/5c89338205ccf4b8ea959a9dc0a33d3b7e02293e))
* **authenticate:** an enrol-challenge sent again after a wrong code carries error and tries_left ([1416bf7](https://github.com/2060-io/credo-ts-ayni-flow/commit/1416bf7a0b12a6bc66843ae8b079e08c7ae3ace5))

## [0.3.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.2.1...credo-ts-didcomm-authenticate@v0.3.0) (2026-11-24)


### ⚠ BREAKING CHANGES

* **authenticate:** an `answer` may carry `consent: false`, which a service must end with a `step-result` `failed` `consent-declined` (`sendStepResult` refuses any other result for that step, and `sendStep` refuses to ask it again); after it the exchange waits for a new `choice` and `sendStep` refuses until it comes. A second `choice` that does not follow a `consent-declined` step result now fails the exchange `malformed` instead of being ignored (a repeat of the current combination is still ignored). `validateAnswer` accepts `consent: false`, `validateStepResult` takes the step it ends, and `createChoice` throws unless a choice is awaited. A fourth `enrol-challenge` of an authenticator app is refused on the service and fails the enrolment on the holder.

### Features

* **authenticate:** a person may decline the face-match consent and choose another combination ([15580cd](https://github.com/2060-io/credo-ts-ayni-flow/commit/15580cdc0be09f3fbfca809e8a9514f55fb51cf6))

## [0.2.1](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.2.0...credo-ts-didcomm-authenticate@v0.2.1) (2026-11-24)


### Bug Fixes

* **release:** a publish job repeated once its version is on npm ends without error; 0.2.1, the authenticate package's first release through trusted publishing ([70c6a7a](https://github.com/2060-io/credo-ts-ayni-flow/commit/70c6a7ae65e5660ea50775f270e517f24e67ac86))
* **release:** a repeated publish job ends without error once its version is on npm; release 0.2.1 ([f56bc91](https://github.com/2060-io/credo-ts-ayni-flow/commit/f56bc917a88311623db1858536c3701813eef575))

## [0.2.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-authenticate@v0.1.10...credo-ts-didcomm-authenticate@v0.2.0) (2026-11-24)


### Features

* **authenticate:** authenticate/1.0, an authentication by one accepted combination of methods and the enrolment of an authenticator app or a passkey ([055bc0d](https://github.com/2060-io/credo-ts-ayni-flow/commit/055bc0d53a4c01ea24ac7e8077ec4f63811a01f8))

## Changelog
