# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
