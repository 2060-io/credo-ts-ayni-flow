# Changelog

## [0.2.1](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.2.0...vs-agent-plugin-ayni-flow@v0.2.1) (2026-11-24)


### Miscellaneous Chores

* **vs-agent-plugin-ayni-flow:** Synchronize ayni-flow versions

## [0.2.0](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.11...vs-agent-plugin-ayni-flow@v0.2.0) (2026-11-24)


### ⚠ BREAKING CHANGES

* **vs-agent-plugin:** the peer status carries authentication.methods (with a credential method's issuers) in place of authentication.credential and authentication.issuers; the call flow kind and the face-match-failed code are removed; authenticate/1.0 and the enrol flow are added.

### Bug Fixes

* **vs-agent-plugin:** restore the authenticate dependency and its release entry, dropped by release 0.1.11 ([973824b](https://github.com/2060-io/credo-ts-ayni-flow/commit/973824bc3fb5d98eaabd034db65bd81318217baa))
* **vs-agent-plugin:** restore the authenticate dependency and its release entry, dropped by release 0.1.11 ([5fb27f4](https://github.com/2060-io/credo-ts-ayni-flow/commit/5fb27f4aeebe99ff07be91b7cd1af0b07c29230b))

## [0.1.11](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.10...vs-agent-plugin-ayni-flow@v0.1.11) (2026-11-24)


### Features

* **authorize:** a request may carry approvals, the approvals needed and the other approvers (FLOW-AUTH-004) ([62c52ea](https://github.com/2060-io/credo-ts-ayni-flow/commit/62c52ea5eb19f3247b929386c279a083d3a50e36))
* **authorize:** a request may carry approvals, the approvals needed and the other approvers (FLOW-AUTH-004) ([c282b88](https://github.com/2060-io/credo-ts-ayni-flow/commit/c282b8842aff3d2aac57abcf1ee1c951b24a7184))

## [0.1.10](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.9...vs-agent-plugin-ayni-flow@v0.1.10) (2026-11-22)


### Bug Fixes

* **ayni-flow:** a close taken before its flow's open ends the flow, and a closed flow stays closed (FLOW-CORE-005) ([1dc4466](https://github.com/2060-io/credo-ts-ayni-flow/commit/1dc4466cc3a3121b8312a7da45ac4bac50fa7215))
* **ayni-flow:** a close taken before its flow's open ends the flow, and a closed flow stays closed (FLOW-CORE-005) ([901ebf9](https://github.com/2060-io/credo-ts-ayni-flow/commit/901ebf90f7824a1619724f308078557241e21e7e))

## [0.1.9](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.8...vs-agent-plugin-ayni-flow@v0.1.9) (2026-11-21)


### Features

* **vs-agent-plugin:** POST /didcomm/ayni-flow/flows takes the open's link, and every flow it returns names it (FLOW-CORE-011) ([f0c8831](https://github.com/2060-io/credo-ts-ayni-flow/commit/f0c8831548488173c8222178a30cfc5fded11e4b))
* **vs-agent-plugin:** POST /didcomm/ayni-flow/flows takes the open's link, and every flow it returns names it (FLOW-CORE-011) ([09d02c8](https://github.com/2060-io/credo-ts-ayni-flow/commit/09d02c82967c868e2ac841855aaae45fcf2f2598))

## [0.1.8](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.7...vs-agent-plugin-ayni-flow@v0.1.8) (2026-11-21)


### Miscellaneous Chores

* **vs-agent-plugin-ayni-flow:** Synchronize ayni-flow versions

## [0.1.7](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.6...vs-agent-plugin-ayni-flow@v0.1.7) (2026-11-17)


### Bug Fixes

* **deps:** the packages run on the Credo build of VS Agent 2.0.0-dev.113 ([4b4687d](https://github.com/2060-io/credo-ts-ayni-flow/commit/4b4687d925e2b7e83f15ae1b5aee9e2cc855e767))
* **deps:** the packages run on the Credo build of VS Agent 2.0.0-dev.113 (0.8.0-alpha-20261106194154) ([ec29d81](https://github.com/2060-io/credo-ts-ayni-flow/commit/ec29d81773713b5798a60fdf31bd90d53a132dad))

## [0.1.6](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.5...vs-agent-plugin-ayni-flow@v0.1.6) (2026-11-16)


### Features

* authentication of a person: status fields, the authenticate message and the authenticate flow kind ([2348501](https://github.com/2060-io/credo-ts-ayni-flow/commit/23485018ca40c4ca8c01904e8e8f0bd36fa9c916))
* the authentication of a person: organizations accepted and how to obtain the credential in the status, the authenticate message, the authenticate flow kind ([35f353b](https://github.com/2060-io/credo-ts-ayni-flow/commit/35f353bd5400c5a3d493e07f38fe1598c13f481f))

## [0.1.5](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.4...vs-agent-plugin-ayni-flow@v0.1.5) (2026-11-15)


### Features

* peer-status/1.0, a party tells its peer where it stands; the session grant request names its endpoint ([27746da](https://github.com/2060-io/credo-ts-ayni-flow/commit/27746da2fc5ed21c0e921e22d4ed3f40d1a0b36b))
* peer-status/1.0, a party tells its peer where it stands; the session grant request names its endpoint ([2ce69f6](https://github.com/2060-io/credo-ts-ayni-flow/commit/2ce69f6ced17cd7f2c5f67fd7db8cfa8081daf18))

## [0.1.4](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.3...vs-agent-plugin-ayni-flow@v0.1.4) (2026-11-11)


### Bug Fixes

* **vs-agent-plugin:** publish through the release workflow, with provenance ([390344b](https://github.com/2060-io/credo-ts-ayni-flow/commit/390344b95ab7c363c32923334c1028e0a2361cda))
* **vs-agent-plugin:** publish through the release workflow, with provenance ([5c82fad](https://github.com/2060-io/credo-ts-ayni-flow/commit/5c82fad2817f5c80c9307bf92c7d74429c5f2c47))

## [0.1.3](https://github.com/2060-io/credo-ts-ayni-flow/compare/vs-agent-plugin-ayni-flow@v0.1.2...vs-agent-plugin-ayni-flow@v0.1.3) (2026-11-01)


### Features

* **vs-agent-plugin:** VS Agent plugin serving the Ayni Flow Profile ([548e0be](https://github.com/2060-io/credo-ts-ayni-flow/commit/548e0bea401fdd10b8e9a85d33f173f5c5ce2c82))
* **vs-agent-plugin:** VS Agent plugin serving the Ayni Flow Profile (Admin API v2, routing, webhook events) ([9d765f5](https://github.com/2060-io/credo-ts-ayni-flow/commit/9d765f51c6d235dbafc9bf94353609d7d3d5187e))


### Bug Fixes

* **packages:** class-transformer and class-validator as peer dependencies, so a runtime install shares the agent's copies ([5d2cf20](https://github.com/2060-io/credo-ts-ayni-flow/commit/5d2cf20d4a8b33871a5bd6f048984ecad62e5a16))
* **vs-agent-plugin:** emit Node-resolvable ESM (NodeNext, explicit .js imports) so VS Agent can import the package at runtime ([93b264d](https://github.com/2060-io/credo-ts-ayni-flow/commit/93b264dd94df2d3c7284159923ddf0959cae1c1f))
