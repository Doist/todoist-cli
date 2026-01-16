# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-01-16)


### Features

* add loading animations with global API proxy integration ([#6](https://github.com/Doist/todoist-cli/issues/6)) ([f8f5db0](https://github.com/Doist/todoist-cli/commit/f8f5db0df5adf1a0d1624ebadb2a9ea6fa422bee))
* add release-please automation with npm publishing ([#7](https://github.com/Doist/todoist-cli/issues/7)) ([4e3f2c5](https://github.com/Doist/todoist-cli/commit/4e3f2c55d33a1268563fed200c0a3bb504b133e5))


### Bug Fixes

* ensure OAuth server cleanup on error before callback resolves ([#5](https://github.com/Doist/todoist-cli/issues/5)) ([ac38547](https://github.com/Doist/todoist-cli/commit/ac38547223710d0708bd8bc440b93dae596307f7))

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
