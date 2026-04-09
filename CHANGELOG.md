## [1.40.0](https://github.com/Doist/todoist-cli/compare/v1.39.3...v1.40.0) (2026-04-09)

### Features

* prevent deletion of non-archived workspace projects ([#247](https://github.com/Doist/todoist-cli/issues/247)) ([21e7c84](https://github.com/Doist/todoist-cli/commit/21e7c8474aea4943fe128cd42ff82cec085811e2))

## [1.39.3](https://github.com/Doist/todoist-cli/compare/v1.39.2...v1.39.3) (2026-04-07)

### Bug Fixes

* try fallback ports when OAuth callback port is in use ([#237](https://github.com/Doist/todoist-cli/issues/237)) ([5115b62](https://github.com/Doist/todoist-cli/commit/5115b62536837264e6901e29b77f02a8af797ffd))

## [1.39.2](https://github.com/Doist/todoist-cli/compare/v1.39.1...v1.39.2) (2026-04-07)

### Bug Fixes

* restore doctor loading feedback ([#238](https://github.com/Doist/todoist-cli/issues/238)) ([281b04d](https://github.com/Doist/todoist-cli/commit/281b04da73ccc971827dc32e1ad86b1a332e50bf))

## [1.39.1](https://github.com/Doist/todoist-cli/compare/v1.39.0...v1.39.1) (2026-04-06)

### Bug Fixes

* **deps:** update dependency @doist/todoist-sdk to v8.1.0 ([#239](https://github.com/Doist/todoist-cli/issues/239)) ([877b4d0](https://github.com/Doist/todoist-cli/commit/877b4d0c9ef29894296a5fcaef103a9def42baa9))

## [1.39.0](https://github.com/Doist/todoist-cli/compare/v1.38.2...v1.39.0) (2026-04-06)

### Features

* add td doctor command ([#224](https://github.com/Doist/todoist-cli/issues/224)) ([9addffa](https://github.com/Doist/todoist-cli/commit/9addffa1d6b04732a6a543fe05206020d6abd8f8))

## [1.38.2](https://github.com/Doist/todoist-cli/compare/v1.38.1...v1.38.2) (2026-04-05)

### Bug Fixes

* migrate bare errors to CliError and wrap SDK errors consistently ([#233](https://github.com/Doist/todoist-cli/issues/233)) ([a12d362](https://github.com/Doist/todoist-cli/commit/a12d362e1ba794bb0b022ce7f2ffe4b13990755f))

## [1.38.1](https://github.com/Doist/todoist-cli/compare/v1.38.0...v1.38.1) (2026-04-05)

### Bug Fixes

* add state-checking guards for archive/unarchive/uncomplete ([#231](https://github.com/Doist/todoist-cli/issues/231)) ([57001f3](https://github.com/Doist/todoist-cli/commit/57001f36beeb03d4e60fc12ef3cca6ee236d52b9))

## [1.38.0](https://github.com/Doist/todoist-cli/compare/v1.37.1...v1.38.0) (2026-04-05)

### Features

* structured JSON errors, --quiet flag, and IDs in mutation output ([#225](https://github.com/Doist/todoist-cli/issues/225)) ([266d134](https://github.com/Doist/todoist-cli/commit/266d1346dcdbe0f624cf6e1c3cd494c8d111891a))

## [1.37.1](https://github.com/Doist/todoist-cli/compare/v1.37.0...v1.37.1) (2026-04-03)

### Bug Fixes

* trim Todoist CLI skill content ([#223](https://github.com/Doist/todoist-cli/issues/223)) ([4bb5434](https://github.com/Doist/todoist-cli/commit/4bb5434ec122300677ef163b7b2baf6cda60a4a9))

## [1.37.0](https://github.com/Doist/todoist-cli/compare/v1.36.1...v1.37.0) (2026-04-03)

### Features

* add --json flag to project collaborators, comment view, and workspace view ([#221](https://github.com/Doist/todoist-cli/issues/221)) ([3ffe08e](https://github.com/Doist/todoist-cli/commit/3ffe08e23ab8603a60e0e7ac3e605951a95edc4b))

## [1.36.1](https://github.com/Doist/todoist-cli/compare/v1.36.0...v1.36.1) (2026-04-02)

### Bug Fixes

* use numeric-aware comparison for prerelease version tags ([#217](https://github.com/Doist/todoist-cli/issues/217)) ([aec21eb](https://github.com/Doist/todoist-cli/commit/aec21eb1d0120e87d12db8cb7fc284f1f9b5cbc0))

## [1.36.0](https://github.com/Doist/todoist-cli/compare/v1.35.1...v1.36.0) (2026-04-02)

### Features

* allow switching between stable and pre-release update channels ([#215](https://github.com/Doist/todoist-cli/issues/215)) ([b0bec2e](https://github.com/Doist/todoist-cli/commit/b0bec2e64363898024be6d7e4c10b9d2fc616974))

## [1.35.1](https://github.com/Doist/todoist-cli/compare/v1.35.0...v1.35.1) (2026-04-01)

### Bug Fixes

* suppress credential manager warning on every command ([#212](https://github.com/Doist/todoist-cli/issues/212)) ([6038dbe](https://github.com/Doist/todoist-cli/commit/6038dbe2870423012a2abc8a299c3fbbffbfb519))

## [1.35.0](https://github.com/Doist/todoist-cli/compare/v1.34.1...v1.35.0) (2026-04-01)

### Features

* show workspace name after joining a project ([#211](https://github.com/Doist/todoist-cli/issues/211)) ([b5c0ea5](https://github.com/Doist/todoist-cli/commit/b5c0ea54fc8aa47ad3ab12992f17b071b8f55b07))

## [1.34.1](https://github.com/Doist/todoist-cli/compare/v1.34.0...v1.34.1) (2026-03-31)

### Bug Fixes

* rename @doist/todoist-api-typescript to @doist/todoist-sdk ([#210](https://github.com/Doist/todoist-cli/issues/210)) ([1b1f532](https://github.com/Doist/todoist-cli/commit/1b1f5324e7273accbcb760e6e204f70595e5343c))

## [1.34.0](https://github.com/Doist/todoist-cli/compare/v1.33.0...v1.34.0) (2026-03-31)

### Features

* add read-only OAuth mode for safe autonomous tool use ([#205](https://github.com/Doist/todoist-cli/issues/205)) ([446756b](https://github.com/Doist/todoist-cli/commit/446756b59f4a4060427afa0e55014bd3de35c857))

## [1.33.0](https://github.com/Doist/todoist-cli/compare/v1.32.0...v1.33.0) (2026-03-30)

### Features

* enhance reminder list with REST API and location reminders ([#199](https://github.com/Doist/todoist-cli/issues/199)) ([73ecbfa](https://github.com/Doist/todoist-cli/commit/73ecbfa44efd482af93b034337d055e391b15c62))

## [1.32.0](https://github.com/Doist/todoist-cli/compare/v1.31.1...v1.32.0) (2026-03-30)

### Features

* add template commands for export, import, and project creation ([#198](https://github.com/Doist/todoist-cli/issues/198)) ([bb7ea06](https://github.com/Doist/todoist-cli/commit/bb7ea06b7564aa4e04810674708377e834e84895))

## [1.31.1](https://github.com/Doist/todoist-cli/compare/v1.31.0...v1.31.1) (2026-03-29)

### Bug Fixes

* changelog parsing skips latest version entry ([#197](https://github.com/Doist/todoist-cli/issues/197)) ([643bc6f](https://github.com/Doist/todoist-cli/commit/643bc6f4d8251b9b5ce4964d2edeac3d9757a4b2))

## [1.31.0](https://github.com/Doist/todoist-cli/compare/v1.30.0...v1.31.0) (2026-03-29)

### Features

* add project and workspace insights commands ([#194](https://github.com/Doist/todoist-cli/issues/194)) ([590aff3](https://github.com/Doist/todoist-cli/commit/590aff3dfd4ed760d4b12f391b17a3b67b6fffbe))

## [1.30.0](https://github.com/Doist/todoist-cli/compare/v1.29.5...v1.30.0) (2026-03-29)

### Features

* add section archive/unarchive and project extras commands ([#192](https://github.com/Doist/todoist-cli/issues/192)) ([f0cb78a](https://github.com/Doist/todoist-cli/commit/f0cb78a20dc959a2e029f40c146de32f763422f9))

## [1.29.5](https://github.com/Doist/todoist-cli/compare/v1.29.4...v1.29.5) (2026-03-29)

### Bug Fixes

* add prepublishOnly script for release safety ([#191](https://github.com/Doist/todoist-cli/issues/191)) ([7c8533c](https://github.com/Doist/todoist-cli/commit/7c8533c1b49e4b2dd2a8fe2e8bbfad3517dea3ed))

## [1.29.4](https://github.com/Doist/todoist-cli/compare/v1.29.3...v1.29.4) (2026-03-29)

### Bug Fixes

* use Node 22 for release workflow ([#190](https://github.com/Doist/todoist-cli/issues/190)) ([00e4c00](https://github.com/Doist/todoist-cli/commit/00e4c0097c4e48758fd9a45019e453acd3b4b47d))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.29.3](https://github.com/Doist/todoist-cli/compare/v1.29.2...v1.29.3) (2026-03-26)


### Bug Fixes

* address skills.sh Snyk security audit findings ([#183](https://github.com/Doist/todoist-cli/issues/183)) ([353a3df](https://github.com/Doist/todoist-cli/commit/353a3df4378eddb7db6eb010d47c70b902cf2f67))
* upgrade Todoist SDK for proxy env var support ([#185](https://github.com/Doist/todoist-cli/issues/185)) ([d128fb9](https://github.com/Doist/todoist-cli/commit/d128fb9baaef8791bcd325ba00730ec5f958cc50))

## [1.29.2](https://github.com/Doist/todoist-cli/compare/v1.29.1...v1.29.2) (2026-03-25)


### Bug Fixes

* use JSON.stringify for robust YAML description escaping ([#180](https://github.com/Doist/todoist-cli/issues/180)) ([1d24b4c](https://github.com/Doist/todoist-cli/commit/1d24b4ce18f8e8015e87b90518b1a307e6a03ea7))

## [1.29.1](https://github.com/Doist/todoist-cli/compare/v1.29.0...v1.29.1) (2026-03-25)


### Bug Fixes

* use cross-platform postinstall script ([#178](https://github.com/Doist/todoist-cli/issues/178)) ([ba03109](https://github.com/Doist/todoist-cli/commit/ba031091cad26ca4ace2a291ce27e1996fa02bc6))

## [1.29.0](https://github.com/Doist/todoist-cli/compare/v1.28.0...v1.29.0) (2026-03-25)


### Features

* add new agent skills ([#176](https://github.com/Doist/todoist-cli/issues/176)) ([69be82c](https://github.com/Doist/todoist-cli/commit/69be82cb4b9be517ef22f810d2a636c1f9a44a1c))

## [1.28.0](https://github.com/Doist/todoist-cli/compare/v1.27.0...v1.28.0) (2026-03-21)


### Features

* add changelog command and post-update hint ([#171](https://github.com/Doist/todoist-cli/issues/171)) ([c5aa3c2](https://github.com/Doist/todoist-cli/commit/c5aa3c2ec92ee97a503c38f69b141730aab6d387))

## [1.27.0](https://github.com/Doist/todoist-cli/compare/v1.26.0...v1.27.0) (2026-03-19)


### Features

* **attachment:** add `td attachment view` command ([#168](https://github.com/Doist/todoist-cli/issues/168)) ([15ef686](https://github.com/Doist/todoist-cli/commit/15ef686ca7ed4e348e1025cb11607747031a3090))

## [1.26.0](https://github.com/Doist/todoist-cli/compare/v1.25.1...v1.26.0) (2026-03-17)


### Features

* **activity:** remove --all flag to prevent unbounded fetches ([#165](https://github.com/Doist/todoist-cli/issues/165)) ([2342e1c](https://github.com/Doist/todoist-cli/commit/2342e1ce6940061cf1c521b54b10247f3ad02622))


### Bug Fixes

* **deps:** update dependency @doist/todoist-api-typescript to v7.1.1 ([#167](https://github.com/Doist/todoist-cli/issues/167)) ([e3831c0](https://github.com/Doist/todoist-cli/commit/e3831c0e166d0b27019e0d8b91db88d360dc0b6c))

## [1.25.1](https://github.com/Doist/todoist-cli/compare/v1.25.0...v1.25.1) (2026-03-17)


### Bug Fixes

* align skill name with install directory ([#158](https://github.com/Doist/todoist-cli/issues/158)) ([5cffb20](https://github.com/Doist/todoist-cli/commit/5cffb2051d7e4943b167bb06c634118e5fc9083c))

## [1.25.0](https://github.com/Doist/todoist-cli/compare/v1.24.1...v1.25.0) (2026-03-15)


### Features

* add task reschedule command ([#151](https://github.com/Doist/todoist-cli/issues/151)) ([6ac1d69](https://github.com/Doist/todoist-cli/commit/6ac1d6975b06fbe55690d35e7e995852f2d24cf6))

## [1.24.1](https://github.com/Doist/todoist-cli/compare/v1.24.0...v1.24.1) (2026-03-15)


### Bug Fixes

* show all subcommands in help for filter, label, and project ([#149](https://github.com/Doist/todoist-cli/issues/149)) ([f72bf1c](https://github.com/Doist/todoist-cli/commit/f72bf1c0bd23a53d79063be7aa35464854e49aae))

## [1.24.0](https://github.com/Doist/todoist-cli/compare/v1.23.0...v1.24.0) (2026-03-14)


### Features

* add --json support to mutating commands ([#147](https://github.com/Doist/todoist-cli/issues/147)) ([7a8d116](https://github.com/Doist/todoist-cli/commit/7a8d11624f09deb8e8974d530c4a92ab6d18f907))
* add --stdin flag to comment add, task add, and task update ([#145](https://github.com/Doist/todoist-cli/issues/145)) ([149d560](https://github.com/Doist/todoist-cli/commit/149d560542e0691edfcb4742f454d1992a2a5bc8))

## [1.23.0](https://github.com/Doist/todoist-cli/compare/v1.22.1...v1.23.0) (2026-03-13)


### Features

* **task:** add --order flag to task add and update ([#143](https://github.com/Doist/todoist-cli/issues/143)) ([51e6428](https://github.com/Doist/todoist-cli/commit/51e6428ff24dd57d16d34a57d661d21bf56df58c))
* **task:** add --uncompletable/--completable flags to task add and update ([#142](https://github.com/Doist/todoist-cli/issues/142)) ([545c931](https://github.com/Doist/todoist-cli/commit/545c9315bd24d262e8713801fb32873ff1bafbfd))


### Bug Fixes

* **deps:** update dependency @doist/todoist-api-typescript to v6.10.0 ([#127](https://github.com/Doist/todoist-cli/issues/127)) ([b537201](https://github.com/Doist/todoist-cli/commit/b53720185535172490018e6019ddab04d093f4e1))
* **deps:** update dependency @doist/todoist-api-typescript to v7.0.0 ([#134](https://github.com/Doist/todoist-cli/issues/134)) ([9ac38c1](https://github.com/Doist/todoist-cli/commit/9ac38c1e762be7c883b3ec574abf67488856f259))
* **deps:** update dependency commander to v14.0.3 ([#131](https://github.com/Doist/todoist-cli/issues/131)) ([75b23f8](https://github.com/Doist/todoist-cli/commit/75b23f8b6a798828be2377136112f7f70de4dba8))
* **deps:** update dependency yocto-spinner to v1.1.0 ([#136](https://github.com/Doist/todoist-cli/issues/136)) ([b77f479](https://github.com/Doist/todoist-cli/commit/b77f4793d4612c90fbc86baf83be28a28e08d268))

## [1.22.1](https://github.com/Doist/todoist-cli/compare/v1.22.0...v1.22.1) (2026-03-11)


### Bug Fixes

* address PR [#121](https://github.com/Doist/todoist-cli/issues/121) review feedback for auth status --json ([#123](https://github.com/Doist/todoist-cli/issues/123)) ([7de6e08](https://github.com/Doist/todoist-cli/commit/7de6e081652f82b319ccb40dc753375ee2afeb74))

## [1.22.0](https://github.com/Doist/todoist-cli/compare/v1.21.0...v1.22.0) (2026-03-11)


### Features

* **activity:** add markdown output mode for activity logs ([#85](https://github.com/Doist/todoist-cli/issues/85)) ([fb55786](https://github.com/Doist/todoist-cli/commit/fb55786b6b5eabe8d93d60fe2baeba5a5332b69a))
* add --json output to auth status command ([#121](https://github.com/Doist/todoist-cli/issues/121)) ([7a0e437](https://github.com/Doist/todoist-cli/commit/7a0e437671e650d58be177a8a96d0a41432bbc8a))
* store auth tokens in OS credential storage ([#120](https://github.com/Doist/todoist-cli/issues/120)) ([efafcfe](https://github.com/Doist/todoist-cli/commit/efafcfef6857fd9c042172fe46acdc71f9c9bfb3))


### Bug Fixes

* address PR [#112](https://github.com/Doist/todoist-cli/issues/112) review feedback ([#115](https://github.com/Doist/todoist-cli/issues/115)) ([6e5a0ff](https://github.com/Doist/todoist-cli/commit/6e5a0ffb746797ced326f17af626ad6b7eebf8a7))


### Performance Improvements

* reduce CLI startup cost by deferring markdown loads and unnecessary project fetches ([#118](https://github.com/Doist/todoist-cli/issues/118)) ([fa9a660](https://github.com/Doist/todoist-cli/commit/fa9a660028a790b6641157868e112075491e9c43))

## [1.21.0](https://github.com/Doist/todoist-cli/compare/v1.20.0...v1.21.0) (2026-03-05)


### Features

* add assignee display to completed tasks command ([#112](https://github.com/Doist/todoist-cli/issues/112)) ([863fe8b](https://github.com/Doist/todoist-cli/commit/863fe8b3f42b8528d2302ba69db7992a3ed70484))

## [1.20.0](https://github.com/Doist/todoist-cli/compare/v1.19.0...v1.20.0) (2026-02-25)


### Features

* suppress package manager output during update ([#104](https://github.com/Doist/todoist-cli/issues/104)) ([06030b8](https://github.com/Doist/todoist-cli/commit/06030b80917875228ead96973edc6a7782143329))

## [1.19.0](https://github.com/Doist/todoist-cli/compare/v1.18.0...v1.19.0) (2026-02-25)


### Features

* replace OAuth page logo with td-cli icon ([#102](https://github.com/Doist/todoist-cli/issues/102)) ([61f0975](https://github.com/Doist/todoist-cli/commit/61f09753611a92695e25a5c19acf6bbed4a79505))

## [1.18.0](https://github.com/Doist/todoist-cli/compare/v1.17.0...v1.18.0) (2026-02-21)


### Features

* add --accessible flag for screen reader and color-blind users ([#95](https://github.com/Doist/todoist-cli/issues/95)) ([d1cd90d](https://github.com/Doist/todoist-cli/commit/d1cd90d824c8c5a01f75fce3433a35c456ea3262))
* add Gemini CLI skill ([#96](https://github.com/Doist/todoist-cli/issues/96)) ([ad85fe3](https://github.com/Doist/todoist-cli/commit/ad85fe31ed1b576bc1d793badf356033bb28d899))


### Bug Fixes

* use pnpm add instead of pnpm install for global updates ([#92](https://github.com/Doist/todoist-cli/issues/92)) ([eacbbb7](https://github.com/Doist/todoist-cli/commit/eacbbb7bce9c47f98661309c7c77d8cf4c4b2e04))

## [1.17.0](https://github.com/Doist/todoist-cli/compare/v1.16.0...v1.17.0) (2026-02-20)


### Features

* add `td update` self-update command ([#88](https://github.com/Doist/todoist-cli/issues/88)) ([3f9fe80](https://github.com/Doist/todoist-cli/commit/3f9fe80743b195874b437c795ffc38989c832c9e))

## [1.16.0](https://github.com/Doist/todoist-cli/compare/v1.15.0...v1.16.0) (2026-02-18)


### Features

* add `td project move` command ([#72](https://github.com/Doist/todoist-cli/issues/72)) ([f71206d](https://github.com/Doist/todoist-cli/commit/f71206d0bb412f360ef7f0728ec14bc69a5ea11d))
* **view:** improve URL routing passthrough and lazy loading ([#79](https://github.com/Doist/todoist-cli/issues/79)) ([aff25df](https://github.com/Doist/todoist-cli/commit/aff25df1badc536ccf283881bdc4117f71a6f1fb))

## [1.15.0](https://github.com/Doist/todoist-cli/compare/v1.14.0...v1.15.0) (2026-02-17)


### Features

* auto-update agent skills on npm package update ([#76](https://github.com/Doist/todoist-cli/issues/76)) ([cb12178](https://github.com/Doist/todoist-cli/commit/cb1217856e9b45769fee9fb7df016f192c6b0604))

## [1.14.0](https://github.com/Doist/todoist-cli/compare/v1.13.0...v1.14.0) (2026-02-17)


### Features

* accept Todoist web app task and project URLs as CLI parameters ([#64](https://github.com/Doist/todoist-cli/issues/64)) ([4c637c1](https://github.com/Doist/todoist-cli/commit/4c637c1cc0da85c84020ba3461803596ef0a4943))
* enhance Todoist URL support for labels, filters, and add view router ([#69](https://github.com/Doist/todoist-cli/issues/69)) ([109ab08](https://github.com/Doist/todoist-cli/commit/109ab0858638ec27b066080d60d5d353db7679da))

## [1.13.0](https://github.com/Doist/todoist-cli/compare/v1.12.0...v1.13.0) (2026-02-16)


### Features

* shell completion support (bash, zsh, fish) ([#66](https://github.com/Doist/todoist-cli/issues/66)) ([994e603](https://github.com/Doist/todoist-cli/commit/994e60386f1b467ffc0440f84b212aa17db87b87))

## [1.12.0](https://github.com/Doist/todoist-cli/compare/v1.11.0...v1.12.0) (2026-02-13)


### Features

* add verbose/trace output for API latency debugging (-v to -vvvv) ([#56](https://github.com/Doist/todoist-cli/issues/56)) ([8d43e99](https://github.com/Doist/todoist-cli/commit/8d43e9913de2add12345ab34fdd98053669cf3d0))
* lenient CLI ergonomics (raw IDs, implicit view, flag aliases) ([#60](https://github.com/Doist/todoist-cli/issues/60)) ([46236b3](https://github.com/Doist/todoist-cli/commit/46236b3290569fbc9bba2d92ab4569ba13d8c87e))


### Performance Improvements

* lazy-load commands and show early spinner for instant feedback ([#65](https://github.com/Doist/todoist-cli/issues/65)) ([9a9b79a](https://github.com/Doist/todoist-cli/commit/9a9b79a8f08dd20baba1c66385a1c9fbf8bc8899))

## [1.11.0](https://github.com/Doist/todoist-cli/compare/v1.10.0...v1.11.0) (2026-02-11)


### Features

* positional content arg for `td task add` ([#55](https://github.com/Doist/todoist-cli/issues/55)) ([3f94899](https://github.com/Doist/todoist-cli/commit/3f9489984ce8e7e2f2e461dcfb50fff737613811))


### Performance Improvements

* server-side assignee scoping and parallel project fetching in today/upcoming ([#59](https://github.com/Doist/todoist-cli/issues/59)) ([94a24b0](https://github.com/Doist/todoist-cli/commit/94a24b08a7c8de127417228bb5a17f5f74f63dc4))

## [1.10.0](https://github.com/Doist/todoist-cli/compare/v1.9.0...v1.10.0) (2026-02-10)


### Features

* auto-retry id-like task refs as direct ID lookups ([#53](https://github.com/Doist/todoist-cli/issues/53)) ([bcdb7f3](https://github.com/Doist/todoist-cli/commit/bcdb7f3772f603a7a99f1f0577012ad835ee46e2))


### Bug Fixes

* use server-side API calls for task list (parent id) and task ref (name search) resolution ([#52](https://github.com/Doist/todoist-cli/issues/52)) ([a2f7776](https://github.com/Doist/todoist-cli/commit/a2f777685c6120e95a84ce8491913513a9bb6d77))

## [1.9.0](https://github.com/Doist/todoist-cli/compare/v1.8.1...v1.9.0) (2026-02-09)


### Features

* redesign OAuth success and error pages ([#47](https://github.com/Doist/todoist-cli/issues/47)) ([08c463a](https://github.com/Doist/todoist-cli/commit/08c463a5a6e34cebfad71f6aa737a6461825553a))


### Bug Fixes

* clarify id: prefix requirement in error messages ([#49](https://github.com/Doist/todoist-cli/issues/49)) ([317a20a](https://github.com/Doist/todoist-cli/commit/317a20a92c29fb03339efc5135b9c1cd4109649e))
* normalize dates to UTC midnight for timezone-independent comparisons ([#50](https://github.com/Doist/todoist-cli/issues/50)) ([4d29ef7](https://github.com/Doist/todoist-cli/commit/4d29ef7800f6866cbba255a6919e378b40773ba7))

## [1.8.1](https://github.com/Doist/todoist-cli/compare/v1.8.0...v1.8.1) (2026-02-06)


### Bug Fixes

* add loading spinner to settings view ([#44](https://github.com/Doist/todoist-cli/issues/44)) ([9829519](https://github.com/Doist/todoist-cli/commit/9829519e677df5916609064d1f990d4bccc9c627))

## [1.8.0](https://github.com/Doist/todoist-cli/compare/v1.7.0...v1.8.0) (2026-02-06)


### Features

* resolve entity names in settings view start page ([#43](https://github.com/Doist/todoist-cli/issues/43)) ([b87e034](https://github.com/Doist/todoist-cli/commit/b87e0346cfb8b37cd8f0a962fa4fc38299b4e46a))


### Bug Fixes

* add all missing commands to agent skill and add skill update command ([#42](https://github.com/Doist/todoist-cli/issues/42)) ([c824675](https://github.com/Doist/todoist-cli/commit/c8246750cc16014896c39a3eb56620b66a0b32c0))
* use server-side filtering for task list commands ([#39](https://github.com/Doist/todoist-cli/issues/39)) ([abd2993](https://github.com/Doist/todoist-cli/commit/abd29934d1a2b31cc144585147d45fae974c3f54))

## [1.7.0](https://github.com/Doist/todoist-cli/compare/v1.6.1...v1.7.0) (2026-02-03)


### Features

* expose workspaceId in project JSON output ([#37](https://github.com/Doist/todoist-cli/issues/37)) ([a833dba](https://github.com/Doist/todoist-cli/commit/a833dba64df417468b3526ea07f9ffa84cf8a992))

## [1.6.1](https://github.com/Doist/todoist-cli/compare/v1.6.0...v1.6.1) (2026-02-02)


### Bug Fixes

* use server-side filtering for today command ([#34](https://github.com/Doist/todoist-cli/issues/34)) ([d9430aa](https://github.com/Doist/todoist-cli/commit/d9430aab1fe407a988ae9a96db5d010af621937f))
* use server-side filtering for upcoming command and fix date formatting ([#35](https://github.com/Doist/todoist-cli/issues/35)) ([9f5c98e](https://github.com/Doist/todoist-cli/commit/9f5c98e613a59d49eafb839f52dfb97d9ed9c3ef))

## [1.6.0](https://github.com/Doist/todoist-cli/compare/v1.5.0...v1.6.0) (2026-01-29)


### Features

* add --progress-jsonl flag for machine-readable progress reporting ([#32](https://github.com/Doist/todoist-cli/issues/32)) ([d89adc5](https://github.com/Doist/todoist-cli/commit/d89adc5f9546167b8c7cf8783cab2be275e66f8e))


### Bug Fixes

* resolve td today missing tasks with specific times ([#30](https://github.com/Doist/todoist-cli/issues/30)) ([06debf4](https://github.com/Doist/todoist-cli/commit/06debf47f3042a403cc78f1bfafad0905347e7a2))

## [1.5.0](https://github.com/Doist/todoist-cli/compare/v1.4.0...v1.5.0) (2026-01-25)


### Features

* add hidden interactive prompt for auth token input ([#25](https://github.com/Doist/todoist-cli/issues/25)) ([aff75a6](https://github.com/Doist/todoist-cli/commit/aff75a6cf51b7dcac137adecb87d095a2a34bbaf))


### Bug Fixes

* migrate sync API from v9 to v1 ([#23](https://github.com/Doist/todoist-cli/issues/23)) ([74fb4bf](https://github.com/Doist/todoist-cli/commit/74fb4bf6b78470276a18947fd61b4d23698be254))

## [1.4.0](https://github.com/Doist/todoist-cli/compare/v1.3.0...v1.4.0) (2026-01-23)


### Features

* add codex and cursor agent skill support ([#20](https://github.com/Doist/todoist-cli/issues/20)) ([6420afa](https://github.com/Doist/todoist-cli/commit/6420afa5f51cf987802dd6ad15da1bff3214a257))

## [1.3.0](https://github.com/Doist/todoist-cli/compare/v1.2.0...v1.3.0) (2026-01-23)


### Features

* add skill install command for coding agent integrations ([#16](https://github.com/Doist/todoist-cli/issues/16)) ([5c544c0](https://github.com/Doist/todoist-cli/commit/5c544c011178a390fadca82d1faf58c375bb8855))


### Bug Fixes

* add UTF-8 charset to OAuth callback HTML responses ([#17](https://github.com/Doist/todoist-cli/issues/17)) ([488fe4b](https://github.com/Doist/todoist-cli/commit/488fe4b2f91de52c0669fb4f42a1b16b888e57b2))
* prevent task creation in archived projects ([#19](https://github.com/Doist/todoist-cli/issues/19)) ([838cdf5](https://github.com/Doist/todoist-cli/commit/838cdf5dbb27181c1763ff3a1d89581a0dea1daa))

## [1.2.0](https://github.com/Doist/todoist-cli/compare/v1.1.2...v1.2.0) (2026-01-19)


### Features

* restore provenance publishing after initial publication ([#14](https://github.com/Doist/todoist-cli/issues/14)) ([8afde59](https://github.com/Doist/todoist-cli/commit/8afde593a2584b452c4e55a823e4834d1e08323b))

## [1.1.2](https://github.com/Doist/todoist-cli/compare/v1.1.1...v1.1.2) (2026-01-19)


### Bug Fixes

* use NPM_TOKEN for initial package publication ([#12](https://github.com/Doist/todoist-cli/issues/12)) ([75cf675](https://github.com/Doist/todoist-cli/commit/75cf6750067ef0227b7f92e658eaee57e95ec8d5))

## [1.1.1](https://github.com/Doist/todoist-cli/compare/v1.1.0...v1.1.1) (2026-01-16)


### Bug Fixes

* exclude CHANGELOG.md from Prettier formatting ([c989d18](https://github.com/Doist/todoist-cli/commit/c989d18f4e62b76df68b3e3c82e127635e10055b))

## [1.1.0](https://github.com/Doist/todoist-cli/compare/v1.0.0...v1.1.0) (2026-01-16)


### Features

* Add Biome linting, upgrade to Node 20, and improve CI/CD pipeline ([#9](https://github.com/Doist/todoist-cli/issues/9)) ([5dc98a5](https://github.com/Doist/todoist-cli/commit/5dc98a5c8f750b16ce9c23df546abee14ce473ec))

## 1.0.0 (2026-01-16)

### Features

- add loading animations with global API proxy integration ([#6](https://github.com/Doist/todoist-cli/issues/6)) ([f8f5db0](https://github.com/Doist/todoist-cli/commit/f8f5db0df5adf1a0d1624ebadb2a9ea6fa422bee))
- add release-please automation with npm publishing ([#7](https://github.com/Doist/todoist-cli/issues/7)) ([4e3f2c5](https://github.com/Doist/todoist-cli/commit/4e3f2c55d33a1268563fed200c0a3bb504b133e5))

### Bug Fixes

- ensure OAuth server cleanup on error before callback resolves ([#5](https://github.com/Doist/todoist-cli/issues/5)) ([ac38547](https://github.com/Doist/todoist-cli/commit/ac38547223710d0708bd8bc440b93dae596307f7))

## [Unreleased]

### Features

- Add comprehensive CLI commands for Todoist task management
- OAuth authentication with PKCE flow
- JSON/NDJSON output formats for AI/LLM integration
- Loading animations with global API proxy support
- Notification management commands

### Bug Fixes

- Ensure OAuth server cleanup on error before callback resolves

### Code Refactoring

- Split api.ts into modular api/ directory structure
- Refactor login command to auth with status/logout subcommands

## [0.1.0] - 2024-XX-XX

Initial release of the Todoist CLI.
