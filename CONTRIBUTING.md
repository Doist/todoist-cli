# Contributing to Todoist CLI

The following is a set of guidelines for contributing to the Todoist CLI. Please read these guidelines before creating an issue or pull request.

## Open Development

All work on Todoist CLI happens directly on [GitHub](https://github.com/Doist/todoist-cli). Both core team members and external contributors send pull requests that go through the same review process.

## Semantic Versioning

Todoist CLI follows [semantic versioning](https://semver.org/). We release patch versions for bugfixes, minor versions for new features or non-essential changes, and major versions for any breaking changes.

Every significant change is documented in the [CHANGELOG.md](CHANGELOG.md) file.

## Branch Organization

Submit all changes to the [main](https://github.com/Doist/todoist-cli/tree/main) branch (via PR) by default. For pre-release work, target the `next` branch instead — see [Release Process](#release-process-core-team-only) for details.

We do our best to keep `main` in good shape, with all tests passing.

## Development Workflow

After cloning the repository and installing dependencies with `npm install`, several commands are at your disposal:

- `npm run build`: Builds the CLI
- `npm run dev`: Runs in development mode
- `npm run lint:check`: Validates code quality
- `npm run lint:write`: Auto-fixes lint issues
- `npm run format:check`: Checks formatting
- `npm run format`: Auto-fixes formatting
- `npm test`: Runs all tests
- `npm run test:watch`: Runs tests in watch mode

## Sending a Pull Request

Before submitting a pull request, please take the following into consideration:

- Create your branch from `main` (or from `next` if working on a pre-release feature)
- Follow the [Commit Message Guidelines](#commit-message-guidelines) below
- Add tests for code that should be tested
- Ensure the test suite passes
- Do not override built-in validation and formatting checks

## Commit Message Guidelines

### Commit Message Format

This repository expects all commit messages to follow the [Conventional Commits Specification](https://www.conventionalcommits.org/) to automate semantic versioning and changelog generation.

Each commit message consists of a **header**, an **optional body**, and an **optional footer**:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Commit types such as `feat:` and `fix:` affect versioning and changelog generation. Other types like `build:`, `chore:`, `ci:`, `docs:`, `perf:`, `refactor:`, `style:` and `test:` are valid but will not trigger a release.

A commit that has the text `BREAKING CHANGE:` at the beginning of its optional body or footer, or appends a `!` after the type/scope, introduces a breaking API change (correlating with `MAJOR` in semantic versioning).

### Semantic Pull Request Validation

PR titles are validated against the Conventional Commits format by CI. When squash-merging, the PR title becomes the commit message, so ensure it follows the format (e.g., `feat: add new command`, `fix: correct auth flow`).

## Release Process (core team only)

The release process is fully automated with [semantic-release](https://github.com/semantic-release/semantic-release). Pushing to `main` (after CI passes) triggers a stable release automatically.

### Pre-releases

To test features before publishing a stable release:

1. **Sync `next` with `main`** before starting new work, and after each stable release (required for semantic-release to correctly initiate the next pre-release versioning cycle):

    ```sh
    git checkout next
    git merge main -m "chore: sync next with main [skip ci]"
    git push origin next
    ```

2. **Develop on a feature branch** based off `next` and open a PR targeting `next`.

3. **Automatic pre-release:** Each PR merge into `next` triggers CI and publishes a pre-release version (e.g., `2.1.0-next.1`) to the `next` dist-tag on npm.

4. **Promote to stable:** When ready, open a PR to merge `next` into `main`. Use a regular merge commit (not squash), as this preserves the individual commit history and allows semantic-release to correctly generate a comprehensive changelog and determine the version bump automatically.

> **Note:** The `CHANGELOG.md` is only updated for stable releases on `main`. Pre-releases still get GitHub release notes and npm publication.

### Installing a pre-release

```sh
npm install @doist/todoist-cli@next
```

## License

By contributing to Todoist CLI, you agree that your contributions will be licensed under its [MIT license](LICENSE).
