# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
