# Changelog

## [0.3.1](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.3.0...credo-ts-didcomm-ayni-flow@v0.3.1) (2026-11-24)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.3.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.2.1...credo-ts-didcomm-ayni-flow@v0.3.0) (2026-11-24)


### ⚠ BREAKING CHANGES

* **authenticate:** an `answer` may carry `consent: false`, which a service must end with a `step-result` `failed` `consent-declined` (`sendStepResult` refuses any other result for that step, and `sendStep` refuses to ask it again); after it the exchange waits for a new `choice` and `sendStep` refuses until it comes. A second `choice` that does not follow a `consent-declined` step result now fails the exchange `malformed` instead of being ignored (a repeat of the current combination is still ignored). `validateAnswer` accepts `consent: false`, `validateStepResult` takes the step it ends, and `createChoice` throws unless a choice is awaited. A fourth `enrol-challenge` of an authenticator app is refused on the service and fails the enrolment on the holder.
* **ayni-flow:** `OpenFlowOptions.requires`, `AyniFlowOpenMessageOptions.requires`, `AyniFlowOpenMessage.requires` and `AyniFlowRecord.requires` are removed; an `open` no longer carries `requires`, and the plugin's open route refuses a body that names it.

### Features

* **authenticate:** a person may decline the face-match consent and choose another combination ([15580cd](https://github.com/2060-io/credo-ts-ayni-flow/commit/15580cdc0be09f3fbfca809e8a9514f55fb51cf6))
* **ayni-flow:** an open carries no requires; the phone's own authentication is asked per protocol ([660f617](https://github.com/2060-io/credo-ts-ayni-flow/commit/660f6179b55193ccca2cf7f7a4c39b0eccbb79e1))

## [0.2.1](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.2.0...credo-ts-didcomm-ayni-flow@v0.2.1) (2026-11-24)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.2.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.11...credo-ts-didcomm-ayni-flow@v0.2.0) (2026-11-24)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.1.11](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.10...credo-ts-didcomm-ayni-flow@v0.1.11) (2026-11-24)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.1.10](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.9...credo-ts-didcomm-ayni-flow@v0.1.10) (2026-11-22)


### Bug Fixes

* **ayni-flow:** a close taken before its flow's open ends the flow, and a closed flow stays closed (FLOW-CORE-005) ([1dc4466](https://github.com/2060-io/credo-ts-ayni-flow/commit/1dc4466cc3a3121b8312a7da45ac4bac50fa7215))
* **ayni-flow:** a close taken before its flow's open ends the flow, and a closed flow stays closed (FLOW-CORE-005) ([901ebf9](https://github.com/2060-io/credo-ts-ayni-flow/commit/901ebf90f7824a1619724f308078557241e21e7e))

## [0.1.9](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.8...credo-ts-didcomm-ayni-flow@v0.1.9) (2026-11-21)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.1.8](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.7...credo-ts-didcomm-ayni-flow@v0.1.8) (2026-11-21)


### Features

* **ayni-flow:** an open may carry a link, an app link the holder offers on the request's sheet (FLOW-CORE-011) ([58ee6fb](https://github.com/2060-io/credo-ts-ayni-flow/commit/58ee6fb9fdbca59d8ce1cc1f950476f410a0c369))
* **ayni-flow:** an open may carry a link, an app link the holder offers on the request's sheet (FLOW-CORE-011) ([ce4e285](https://github.com/2060-io/credo-ts-ayni-flow/commit/ce4e285315d1d275332e6366099ed71771839760))

## [0.1.7](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.6...credo-ts-didcomm-ayni-flow@v0.1.7) (2026-11-17)


### Bug Fixes

* **deps:** the packages run on the Credo build of VS Agent 2.0.0-dev.113 ([4b4687d](https://github.com/2060-io/credo-ts-ayni-flow/commit/4b4687d925e2b7e83f15ae1b5aee9e2cc855e767))
* **deps:** the packages run on the Credo build of VS Agent 2.0.0-dev.113 (0.8.0-alpha-20261106194154) ([ec29d81](https://github.com/2060-io/credo-ts-ayni-flow/commit/ec29d81773713b5798a60fdf31bd90d53a132dad))

## [0.1.6](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.5...credo-ts-didcomm-ayni-flow@v0.1.6) (2026-11-16)


### Features

* authentication of a person: status fields, the authenticate message and the authenticate flow kind ([2348501](https://github.com/2060-io/credo-ts-ayni-flow/commit/23485018ca40c4ca8c01904e8e8f0bd36fa9c916))
* the authentication of a person: organizations accepted and how to obtain the credential in the status, the authenticate message, the authenticate flow kind ([35f353b](https://github.com/2060-io/credo-ts-ayni-flow/commit/35f353bd5400c5a3d493e07f38fe1598c13f481f))

## [0.1.5](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.4...credo-ts-didcomm-ayni-flow@v0.1.5) (2026-11-15)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.1.4](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.3...credo-ts-didcomm-ayni-flow@v0.1.4) (2026-11-11)


### Miscellaneous Chores

* **credo-ts-didcomm-ayni-flow:** Synchronize ayni-flow versions

## [0.1.3](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.2...credo-ts-didcomm-ayni-flow@v0.1.3) (2026-11-01)


### Features

* **vs-agent-plugin:** VS Agent plugin serving the Ayni Flow Profile ([548e0be](https://github.com/2060-io/credo-ts-ayni-flow/commit/548e0bea401fdd10b8e9a85d33f173f5c5ce2c82))


### Bug Fixes

* **packages:** class-transformer and class-validator as peer dependencies, so a runtime install shares the agent's copies ([5d2cf20](https://github.com/2060-io/credo-ts-ayni-flow/commit/5d2cf20d4a8b33871a5bd6f048984ecad62e5a16))

## [0.1.2](https://github.com/2060-io/credo-ts-ayni-flow/compare/credo-ts-didcomm-ayni-flow@v0.1.0...credo-ts-didcomm-ayni-flow@v0.1.2) (2026-11-01)


### Features

* ayni-flow envelope and the seven carrier protocol modules ([39605f8](https://github.com/2060-io/credo-ts-ayni-flow/commit/39605f81682f2109e1a30c2d271d491f23cd1bc2))
* ayni-flow envelope and the seven carrier protocol modules of the Ayni Flow Profile 1.0 ([fc7b173](https://github.com/2060-io/credo-ts-ayni-flow/commit/fc7b173c18c19a07e8ad1a0b2a62055f3db69400))
