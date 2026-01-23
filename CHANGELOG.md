# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
