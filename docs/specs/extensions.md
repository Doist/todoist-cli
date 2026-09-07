# Extensions for the Todoist CLI

## Status

Draft — for discussion.

## Summary

Add a `gh`-style extension system to `td`. An extension is an executable named `td-<name>` that lives in a per-user directory. Running `td <name> …` executes it with the remaining arguments untouched. Extensions are installed from a GitHub repository (either a git clone or a prebuilt release binary) or from a local directory, and are managed with `td extension install|list|upgrade|remove|exec`.

Because the contract between `td` and an extension is the process boundary (argv, environment, stdin/stdout/stderr, exit code) rather than a JavaScript API, extensions can be written in any language: a Node script, a shell script, a Go or Rust binary, a Python program. Anything that can be executed works. Extensions that need Todoist data do what a user would do: they call `td` itself (`td task list --json`, `td auth token view`), so they inherit authentication, account selection, and output conventions without a shared library.

The dispatch and management logic is generic, so it belongs in `@doist/cli-core` where `tdc` and `tda` can adopt it with a one-line registration. `td` is the first host.

## Motivation

From the original proposal:

> It would make it a lot easier to test new features on Todoist (remember `td goals`??). It would also allow people to add things to the CLI that we may not have thought of, or are not prepared to maintain ourselves.

Concretely:

1. **Prototyping.** A feature behind a server-side flag, or one that is still being designed, can ship as `Doist/td-goals` today and be used by the people testing it, without a release of `td` and without dead code in `main` when the experiment ends. If the feature graduates, the extension is either promoted into core or stays an extension.
2. **Community.** People already script `td` in shell and Python. An extension mechanism gives those scripts a home (`td standup`, `td weekly-review`, `td export-obsidian`) and a discovery path, with no obligation on Todoist to maintain them.
3. **Consistency with the other Todoist CLIs.** One implementation in cli-core means `tdc` and `tda` gain the same feature for free, with the same commands and the same on-disk layout.

### Non-goals

- In-process JavaScript plugins that register Commander commands directly. See "Alternatives considered".
- A marketplace, ratings, or any hosted registry. Discovery is a GitHub topic, like `gh`.
- Sandboxing. An extension runs with the user's privileges, exactly like any program the user installs. The spec is explicit about this in the install warning.

## Prior art: how `gh` does it

Everything below is modelled on `gh extension` (cli/cli `pkg/cmd/extension`), which has been stable since 2021 and is familiar to the audience most likely to write extensions. Where this spec departs from `gh` it says so and why. The main departures:

| Area                        | `gh`                                       | This spec                                                                                                                                                    |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Context passed to the child | Only `GH_EXTENSION=1` (added Aug 2026)     | `TD_EXTENSION`, `TD_PATH`, `TD_VERSION`, `TD_EXTENSION_NAME`, `TD_EXTENSION_DIR`, `TD_CONFIG_DIR`, and the resolved `--user`                                 |
| Help text for extensions    | Fixed string `Extension <name>`            | Optional `td-extension.json` manifest supplies a description and a minimum host version                                                                      |
| Node extensions             | No special handling; deps must be vendored | If the clone has a `package.json`, install runs `npm ci --omit=dev`; shebang `#!/usr/bin/env node` scripts run under the host's own `node` on every platform |
| Release asset verification  | None                                       | Verify against a `checksums.txt` / `*.sha256` release asset when one exists; warn when it does not                                                           |
| Trust warning               | Printed after install                      | Printed before any step that can run repository code                                                                                                         |
| Argument completion         | None                                       | Optional, opt-in protocol (phase 3)                                                                                                                          |

## Terminology

The user-facing word is **extension**, not plugin. It matches `gh`, it avoids implying in-process loading, and `td ext` is a comfortable short form. The proposal thread uses "plugin"; this spec treats them as synonyms and standardises on "extension" in code and docs.

## User experience

### Running an extension

```bash
td goals                     # runs td-goals with no args
td goals add "Ship v5" --by 2026-12-01
td goals --help              # forwarded verbatim; td never interprets args after the name
td --user alice@example.com goals list   # global flags before the name are td's
```

Rules:

- Everything after the extension name is passed to the extension verbatim. `td` does not parse, validate, or reorder it. That includes `--help`, `--json`, and `--user`.
- Global `td` flags that appear **before** the extension name are consumed by `td` and translated into environment variables for the child (see "Environment contract"). `--user` is the important one.
- The child's stdin, stdout, and stderr are the parent's. `td` adds nothing to either stream on success, so `td goals list --json | jq` works.
- `td` exits with the extension's exit code. If the extension is killed by a signal, `td` exits `128 + signal` in the usual way.
- Spinners are not started for extension dispatch; the extension owns its terminal.

### Managing extensions

```
td extension install <source> [--pin <ref>] [--force]
td extension list [--json]
td extension upgrade [<name> | --all] [--force] [--dry-run]
td extension remove <name>
td extension exec <name> [args...]
```

`td ext` is an alias for `td extension`. All subcommands support `--json` where they produce data, following the repo's existing conventions (`formatJson`, `CliError` codes, `--dry-run` previews with the standard `[dry-run] Would …` block).

#### `install <source>`

`<source>` is one of:

| Form          | Example                                 | Result                                                                            |
| ------------- | --------------------------------------- | --------------------------------------------------------------------------------- |
| `owner/repo`  | `Doist/td-goals`                        | GitHub. Binary release if the latest release has a matching asset, else git clone |
| Full URL      | `https://github.com/example/td-standup` | Same as above; also allows non-github.com hosts via git                           |
| `.` or a path | `td extension install .`                | Local development install: a symlink to the directory                             |

Repository names must start with `td-`. The command name is the repository name without the prefix. The same rule applies to local installs: the directory's basename must be `td-<name>`, it must contain an executable of the same name, and the name is validated with the same pattern and errors as a GitHub install.

Install steps for a GitHub source:

1. Validate the name: must match `^td-[a-z0-9][a-z0-9-]*$`, and the command name must not match a built-in command or alias. Refuse with `EXTENSION_NAME_RESERVED` and a hint pointing at `td extension exec` if the extension is already installed and a later `td` release added a core command with the same name.
2. If an extension with this command name is already installed from a different owner, refuse with `EXTENSION_ALREADY_INSTALLED` (`--force` replaces it). Same owner: report already installed, suggest `upgrade`.
3. Print the trust warning (below). It goes out before any step that can run code from the repository, so a user sees it even if a later step fails or executes something.
4. Query `GET /repos/{owner}/{repo}/releases/latest`, or `GET /repos/{owner}/{repo}/releases/tags/{ref}` when `--pin <ref>` is given. If the release has an asset whose name ends in `<platform>-<arch>[.exe]` for the current machine, treat it as a **binary extension**: download the asset to `<dir>/td-<name>[.exe]`, `chmod 0755`, verify the checksum when the release also carries `checksums.txt` or `<asset>.sha256`, fetch the repository's `td-extension.json` at the release tag (`GET /repos/{owner}/{repo}/contents/td-extension.json?ref={tag}`, optional, a 404 is not an error), and write `manifest.json` including any `description` and `requires` found there. A pinned tag with no release falls through to the git path below. Platform names use Node's `process.platform` / `process.arch` values (`linux-x64`, `darwin-arm64`, `win32-x64`) rather than Go's, since extension authors building with Node will already have those in hand. A release workflow template (phase 2) produces both spellings so a single repo can serve both `gh` and `td` if the author wants.
5. Otherwise `git clone` it into a staging directory. This is a **script extension**. With `--pin <ref>`, check out the ref and record the SHA. A clone failure surfaces git's own error as `EXTENSION_NOT_INSTALLABLE` hints. If the clone has no root file named `td-<name>`, the staging directory is removed and install fails with `EXTENSION_NOT_INSTALLABLE`; there is no separate pre-clone check because the clone already proves the repository is reachable.
6. If the clone contains `package.json`, run `npm ci --omit=dev` (falling back to `npm install --omit=dev` when there is no lockfile) inside it. Lifecycle scripts are allowed to run: native dependencies need them, and the trust decision was already made at step 3. `npm` is expected because `td` is normally installed with it, but it is not guaranteed (Debian packages Node and npm separately, and some setups use pnpm or corepack). A missing `npm` fails with `EXTENSION_NPM_MISSING` and a hint to install npm or to vendor the dependencies. Any other failure is `EXTENSION_INSTALL_FAILED` with the npm output attached as hints.
7. Move the staging directory into place and print the install location.

`GH_TOKEN` / `GITHUB_TOKEN` are honoured for the GitHub API and asset downloads so that private repositories work. This matters for Todoist-internal prototypes. Git clones use the user's own git credential setup.

The trust warning is printed on every install and upgrade:

```
Installed td-goals from Doist/td-goals (v0.3.0) to ~/.local/share/todoist-cli/extensions/td-goals

Extensions are not reviewed, signed, or endorsed by Todoist. Installing one runs
code from its publisher with your permissions and your Todoist credentials.
Review the source before use.
```

#### `list`

```
NAME        SOURCE                       VERSION   KIND
goals       Doist/td-goals               v0.3.0    binary
standup     example/td-standup           a1b2c3d4  git (pinned)
scratch     ~/code/td-scratch            —         local
weekly      example/td-weekly            0.1.0     git · shadowed by built-in "weekly"
```

No network access. `--json` returns the manifest fields plus `path`, `kind`, `shadowed`, and `executable` (false when the file is missing or not executable, which is the usual state of a freshly cloned Go extension that has not been built).

#### `upgrade`

- Git extensions: `git pull --ff-only`; with `--force`, `git fetch` and `git reset --hard origin/HEAD`. Re-run the `npm ci` step if `package.json` changed.
- Binary extensions: repeat the release lookup and download when the tag differs.
- Pinned extensions are skipped with a note unless `--force`. Local extensions are always skipped.
- `--all` checks every extension, fetching release metadata through a small worker pool (four at a time) under a single spinner. Bounding it avoids a request burst against GitHub's secondary rate limits when many extensions are installed.
- `--dry-run` reports what would change and exits 0.

#### `remove`

Deletes the extension directory and its state file. Accepts `name`, `td-name`, or `owner/td-name`. Requires no confirmation; the operation is reversible by reinstalling and the repo convention is `--yes` only for data-destroying commands.

#### `exec`

`td extension exec <name> [args...]` dispatches directly, bypassing the built-in command table. It is the escape hatch for the shadowed case and for scripting where an explicit form is preferable.

### Help and discovery

- `td --help` gains an `Extensions:` section listing installed extensions with the description from their manifest, or `Extension <name>` when there is none. This is where `gh` is weakest, and a one-line description is cheap for authors to provide.
- `td <name> --help` is forwarded to the extension, which is expected to print its own usage.
- `td extension --help` includes the trust warning and a pointer to the authoring guide.
- Discovery uses the GitHub topic `td-extension`. `td extension search` (phase 2) wraps the GitHub search API over that topic, filters to `td-` prefixed repos, and marks installed ones.

## On-disk layout

```
${XDG_DATA_HOME:-~/.local/share}/todoist-cli/extensions/
├─ td-goals/
│  ├─ td-goals              # executable (binary or script)
│  └─ manifest.json         # written by td for binary installs
├─ td-standup/              # git clone
│  ├─ .git/
│  ├─ td-standup
│  ├─ td-extension.json     # optional, authored by the extension
│  ├─ package.json          # optional; triggers npm ci on install/upgrade
│  └─ node_modules/
└─ td-scratch -> ~/code/td-scratch   # local install (symlink)

${XDG_STATE_HOME:-~/.local/state}/todoist-cli/extensions/
└─ td-goals.json            # { pinned, checkedForUpdateAt, latestRelease }
```

On Windows the data root is `%LOCALAPPDATA%\todoist-cli`, and a local install writes a plain text file containing the target path instead of a symlink, as `gh` does, because symlinks need elevated rights there.

Kind is inferred from the directory: `manifest.json` means binary; a `.git` directory means git; a symlink or path file means local. No central registry file, so a broken or hand-deleted extension cannot corrupt the others, and `rm -rf` of a directory is a valid uninstall.

The config file is untouched. Nothing in this design needs a new config key, so `validateConfigForDoctor` and `KNOWN_CONFIG_KEYS` are unaffected.

### `manifest.json` (written by `td`, binary extensions only)

```json
{
    "owner": "Doist",
    "name": "td-goals",
    "host": "github.com",
    "tag": "v0.3.0",
    "pinned": false,
    "asset": "td-goals_v0.3.0_linux-x64",
    "sha256": "…",
    "installedAt": "2026-09-07T10:12:00Z",
    "description": "Track quarterly goals against Todoist projects",
    "requires": { "td": ">=4.0.0" }
}
```

### `td-extension.json` (optional, written by the author)

```json
{
    "description": "Track quarterly goals against Todoist projects",
    "requires": { "td": ">=4.0.0" },
    "completion": false
}
```

- `description` is shown in `td --help` and `td extension list`. For binary installs it is copied into `manifest.json` at install time, since the binary asset does not carry the file.
- `requires.td` is a semver range. When the running `td` does not satisfy it, dispatch still happens, but a warning goes to stderr first. Refusing outright would make a `td` upgrade break a working extension for no good reason; the extension can enforce it itself using `TD_VERSION` if it must.
- `completion` opts in to the argument-completion protocol (phase 3).

For Node extensions the same fields may instead be supplied under a `"td"` key in `package.json`, so authors do not need two metadata files. `td-extension.json` wins when both exist.

## Environment contract

The child process inherits the parent's environment plus:

| Variable                                    | Value                                | Purpose                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TD_EXTENSION`                              | `1`                                  | Lets a script know it was launched by `td` (adjust usage strings, skip its own update checks, and so on)                                                                                                                  |
| `TD_EXTENSION_NAME`                         | `goals`                              | The command name, so one executable can be installed under several names                                                                                                                                                  |
| `TD_EXTENSION_DIR`                          | absolute path                        | The extension's own directory, for locating bundled assets                                                                                                                                                                |
| `TD_PATH`                                   | absolute path to `td`'s entry script | `process.argv[1]` resolved, so `dist/index.js` of the running install. Directly executable on POSIX (shebang + exec bit). Not directly spawnable on Windows, so use it with `TD_NODE`                                     |
| `TD_NODE`                                   | absolute path to the Node binary     | `process.execPath`. `spawn(TD_NODE, [TD_PATH, ...args])` is the portable way to call the host from any platform and guarantees the Node version `td` itself runs on                                                       |
| `TD_VERSION`                                | `4.0.0`                              | Feature detection                                                                                                                                                                                                         |
| `TD_CONFIG_DIR`                             | `~/.config/todoist-cli`              | Read-only interest, such as finding `config.json` for the default workspace. Extensions must not write here                                                                                                               |
| `TD_USER`                                   | id or email                          | Set only when `--user` was passed before the extension name. `td` itself gains support for reading `TD_USER` as the fallback for `--user`, so nested `td` calls act as the same account with no plumbing in the extension |
| `TD_ACCESSIBLE`, `TD_SPINNER`, `TD_VERBOSE` | as resolved                          | Already environment-driven in `td`, so they propagate naturally. `--accessible` before the name sets `TD_ACCESSIBLE=1`, and so on                                                                                         |

Deliberately **not** set:

- **The API token.** Putting a secret in the environment hands it to every grandchild process and to anything that dumps the environment. `td` never reads the keyring on an extension's behalf. Extensions that need the raw token run `td auth token view`, which is explicit, already exists, and honours `--user` and `TODOIST_API_TOKEN`. Most extensions should not need it at all; `td … --json` covers the common cases and keeps them insulated from API changes.

One explicit exception: when the user has set `TODOIST_API_TOKEN` themselves, it is inherited like any other variable. Stripping it would break nested `td` calls for people who authenticate that way, and a user who puts a token in the environment has already chosen to expose it to every process they start. The rule is that `td` does not inject secrets, not that it scrubs the user's environment.

- **Output mode.** `--json` after the extension name is the extension's flag to interpret. `td` has no opinion.

### Calling `td` from an extension

This is the intended data path and the reason non-TypeScript extensions are practical:

```bash
#!/usr/bin/env bash
set -euo pipefail
td=(td)
if [[ -n "${TD_NODE:-}" && -n "${TD_PATH:-}" ]]; then td=("$TD_NODE" "$TD_PATH"); fi
"${td[@]}" task list --filter "today" --json --full | jq -r '.[] | .content'
```

```js
#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const { TD_NODE, TD_PATH } = process.env
const [cmd, prefix] = TD_NODE && TD_PATH ? [TD_NODE, [TD_PATH]] : ['td', []]
const { stdout } = await promisify(execFile)(cmd, [...prefix, 'project', 'list', '--json'])
const projects = JSON.parse(stdout)
```

On POSIX, `"$TD_PATH" task list` also works because the entry script has a shebang and an exec bit. The two-part form above is the one that works everywhere, including Windows where npm installs `td` as a `.cmd` shim that is not on the child's path as a plain executable.

Because `td` already treats `--json` output and `CliError` JSON envelopes as a stable contract for AI agents, extensions get the same guarantee.

## Dispatch design

### Startup cost

`td` starts by registering placeholders for its built-in commands without importing them. Extensions are discovered by a single `readdir` of the extensions directory, which costs well under a millisecond and returns nothing for the majority of users who have no extensions. Discovery runs on every invocation because it is needed for `--help`, for completion, and for the unknown-command path. Manifests are read lazily: for `list`, `--help`, the shadowing check, and at dispatch for the one extension being run (a single small file, needed for the `requires.td` warning).

### Registration

Each discovered extension whose name does not collide with a built-in command is registered as a Commander command with:

- `.description()` from its manifest, or `Extension <name>`.
- `.allowUnknownOption()`, `.passThroughOptions()`, and `.helpOption(false)`, so Commander touches nothing after the name.
- An action that spawns the executable.

Registering real commands, rather than catching the unknown-command error, is what `gh` does and it is the right call here too: it makes `--help` and name completion work with no special cases, and it keeps the existing dispatcher's "find the command token in argv" logic intact. A colliding name is skipped and surfaces as `shadowed` in `list`.

The existing pre-parse `--user` handling in `src/index.ts` needs one adjustment: both the value lookup (`getRequestedUserRef`, which today scans all of argv) and the stripping (`stripUserFlag`) must only consider arguments before the extension name. Anything after it is opaque, so `td goals --user alice` must reach the extension untouched and must not set `TD_USER`.

### Spawning

- Binaries and scripts with an executable bit: `spawn(path, args, { stdio: 'inherit' })`.
- Scripts whose first line is `#!/usr/bin/env node` (or any `node` shebang): spawn with `process.execPath` on every platform. This is a small departure from `gh` that makes Node extensions work on Windows without Git Bash and guarantees the Node version `td` itself requires.
- Other scripts on Windows: run through `sh.exe -c '"$0" "$@"'` if `sh.exe` is on `PATH`, else fail with `EXTENSION_NEEDS_SHELL` and a hint to install Git for Windows. Same behaviour as `gh`.
- `.cmd` / `.exe` on Windows: spawn directly.

The spawn helper is new: nothing in the repo currently shells out apart from `open` for the browser and cli-core's update command. It lives in cli-core next to the extension manager.

### Error mapping

New `CliError` codes: `EXTENSION_NOT_FOUND`, `EXTENSION_NAME_INVALID`, `EXTENSION_NAME_RESERVED`, `EXTENSION_ALREADY_INSTALLED`, `EXTENSION_NOT_INSTALLABLE`, `EXTENSION_NOT_EXECUTABLE`, `EXTENSION_NEEDS_SHELL`, `EXTENSION_INSTALL_FAILED`, `EXTENSION_NPM_MISSING`, `EXTENSION_CHECKSUM_MISMATCH`, `EXTENSION_PINNED`. All render through the existing JSON and pretty error formatters.

An unknown command that is not an extension keeps Commander's current message, with one added hint when the extensions directory is empty: `Run "td extension install <owner/repo>" to add commands from extensions.` Cheap, and it is how people learn the feature exists.

### Doctor and completion

- `td doctor` gains a check per installed extension: directory readable, executable present and executable, manifest parses, not shadowed, `requires.td` satisfied. Each maps to a fix hint.
- Name completion works for free once extensions are Commander commands. The completion server's "load only the command being completed" optimisation treats extension names as needing no module load.

## Authoring guide (summary; the full guide is a separate doc when the feature ships)

1. Create a repository named `td-<name>` with an executable `td-<name>` at its root. Add the `td-extension` topic.
2. Call `td` for data, using `TD_NODE` + `TD_PATH` as shown in the environment contract so it works on every platform. Prefer `--json`. Treat `--user` as `td`'s job.
3. Honour `--json` on your own output if you produce data. Write data to stdout and diagnostics to stderr. Exit non-zero on failure. If you emit JSON errors, use `td`'s shape: `{ "error": { "code", "message", "hints" } }`.
4. Do not prompt when stdin is not a TTY. `td` is non-interactive by design and agents will call your extension.
5. Node authors: a shebang script plus `package.json` is enough. Dependencies are installed by `td` on install. `@doist/cli-core` is on npm and gives you the same spinner, JSON formatting, and error classes `td` uses, if you want the output to match.
6. Compiled authors: publish release assets named `td-<name>_<tag>_<platform>-<arch>[.exe]` for at least `linux-x64`, `darwin-arm64`, `darwin-x64`, `win32-x64`, plus a `checksums.txt`.
7. Test locally with `td extension install .` from a directory named `td-<name>` and iterate; the symlink means every edit is live.

`td extension create <name> [--template node|bash|compiled]` (phase 2) scaffolds all of this, including the release workflow for compiled extensions.

## Phasing

### Phase 1 — core (ships the feature)

- cli-core: `createExtensionManager({ binName, dataDir, stateDir, envPrefix, reservedNames })` returning discover, install (GitHub git/binary, local), list, upgrade, remove, dispatch. Generic over the host name so `tdc`/`tda` reuse it.
- cli-core: `registerExtensionCommands(program, manager)` adding `extension` / `ext` and the per-extension pass-through commands.
- todoist-cli: wire it in `src/index.ts`; add `TD_USER` env support to the user resolver; adjust `--user` stripping; add the unknown-command hint; doctor checks; `SKILL_CONTENT` entries for `td extension …`; `CODEBASE.md` registration-pattern update.
- Trust warning on install/upgrade. Checksum verification when a checksums asset exists.
- Tests: manager unit tests with a fake filesystem and stubbed GitHub API, including a mismatched or truncated release asset refusing to install with `EXTENSION_CHECKSUM_MISMATCH`, and `--pin` resolving a tagged release rather than latest; dispatch tests asserting argv passthrough, env contract, `--user` scoping, and exit-code propagation; a fixture extension in `src/test-support/` for end-to-end runs.
- Dogfood: `Doist/td-goals` (or whichever prototype is live) rebuilt as an extension before the release, so the first release is validated by a real consumer.

### Phase 2 — ergonomics

- `td extension create` scaffolding with three templates and a release workflow for compiled extensions.
- `td extension search` over the `td-extension` topic.
- Non-blocking update notice after an extension runs, at most once per 24 hours, suppressed in CI and non-TTY. Same rules as `gh`.
- `TD_EXTENSION` handling in `td` itself: skip the `td update` nag when running as a nested call.
- `tdc` and `tda` adopt the cli-core module.

### Phase 3 — optional integrations

- **Argument completion.** With `"completion": true` in the manifest, the completion server runs the executable with `TD_COMPLETE_LINE=<line>` and `TD_COMPLETE_POINT=<cursor>` set and no arguments, and takes newline-separated candidates from stdout. Simple enough for a bash script to implement, and it stays out of the way for everyone else.
- **Agent skills.** An extension may ship `SKILL.md`; `td skill install` and `td skill update` append installed extensions' skill content under an "Extensions" heading so agents learn the new commands. This is the piece that no other CLI's extension system has and it fits the direction `td` is already taking.
- **npm as an install source.** `td extension install npm:@doist/td-goals`, installing into the extension directory with `npm install --prefix`. Gives Todoist a provenance-attested publishing path without GitHub releases. Deferred because GitHub covers the first use cases and the local-path flow already works for development.

## Alternatives considered

**In-process JavaScript plugins.** An npm package exports `register(program)` and `td` imports it at startup. Richer (shared spinner, tables, config, SDK client) and no process spawn. Rejected as the primary mechanism because it is Node-only, couples every plugin to `td`'s Commander and cli-core versions, runs third-party code inside the process that holds the keyring handle, and makes the lazy-loading startup path hard to keep fast. Nothing in this spec prevents adding it later as a second kind of extension if a compelling need appears, but the process model covers the motivating cases and is what people already know from `gh`.

**Unknown-command fallback instead of registration.** Catch Commander's unknown-command error and then look on disk. Slightly less work at startup, but it loses `--help` listing and name completion, and it means an extension named after a future core command silently changes behaviour on upgrade. Registration with an explicit `shadowed` state is clearer.

**Injecting the token into the environment.** Convenient for one-off scripts. Rejected for the reasons in the environment contract; `td auth token view` is one line away and keeps the choice explicit.

**A single `~/.config/todoist-cli/extensions.json` registry.** Rejected in favour of directory-as-truth so that partial failures and manual cleanup cannot desynchronise a registry from the filesystem.

## Open questions

1. **cli-core first, or todoist-cli first?** The spec proposes building the generic manager in cli-core from the start. If iteration speed matters more, build in `src/lib/extensions/` here and move it once the shape settles; the cost is one extra PR later.
2. **Official extensions.** Should extensions under the `Doist` GitHub organisation get a visible marker in `list` and `search`, and be exempt from the trust warning? `gh` marks official ones for telemetry only. A `✓ Todoist` column is low cost and useful for the prototyping use case; suggest yes for `list`, but keep the warning.
3. **Windows.** The README lists Windows Credential Manager as a supported store, so Windows is a target. The Node-shebang shortcut and the `sh.exe` fallback both need testing there before phase 1 ships; is that a blocker for phase 1 or acceptable as a known gap?
4. **Telemetry.** `setActiveCommandPath` records `td <command>` for usage tracking. Proposal: record `td extension` for third-party extensions without the name, and the full name for Todoist-owned ones, mirroring `gh`.
5. **Name.** `extension` (with `ext`) as specified, or `plugin`? Decide before anything ships; renaming later means aliases for ever.

## References

- `gh extension` manual: https://cli.github.com/manual/gh_extension
- Creating GitHub CLI extensions: https://docs.github.com/en/github-cli/github-cli/creating-github-cli-extensions
- cli/cli extension manager source: https://github.com/cli/cli/tree/trunk/pkg/cmd/extension
- Related decision: [001: Lenient CLI Ergonomics](../decisions/001-lenient-cli-ergonomics.md)
