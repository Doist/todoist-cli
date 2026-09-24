# Writing a td extension

An extension adds a command to `td`. It is an executable named `td-<name>`, and once installed, `td <name> …` runs it with every argument after the name passed through untouched.

The contract between `td` and an extension is the process boundary: argv, environment variables, stdin/stdout/stderr, and the exit code. There is no JavaScript API to import. An extension can be a shell script, a Node script, a Python program, or a compiled Go or Rust binary. When it needs Todoist data, it calls `td` itself (`td task list --json`), so authentication, account selection, and output shapes stay `td`'s job.

This guide covers everything needed to write, test, and publish one. The design rationale lives in [`specs/extensions.md`](specs/extensions.md).

> Extensions are not reviewed, signed, or endorsed by Todoist. They run with the user's permissions and can act on their Todoist account. `td` prints a warning to that effect whenever it installs or upgrades an extension from a remote source. Local installs (`td extension install .`) skip it, since the code is already on the machine.

## Quick start

```bash
td extension create standup --description "Print a daily standup summary"
cd td-standup
td extension install .   # symlinks this directory, so edits are live
td standup
td standup --json
```

`td extension create` takes `--template bash` or `--template node` (the default is `bash`). It scaffolds a directory named `td-<name>` containing:

| File                | Purpose                                                                             |
| ------------------- | ----------------------------------------------------------------------------------- |
| `td-<name>`         | The executable. Shows how to call `td` back, handle `--help` and `--json`, and exit |
| `td-extension.json` | Optional metadata: a description for `td --help` and a minimum `td` version         |
| `package.json`      | Node template only. Dependencies go here                                            |
| `README.md`         | Install and development instructions for your users                                 |

## Naming

- The repository (or local directory) must be named `td-<name>` and match `^td-[a-z0-9][a-z0-9-]*$`.
- It must contain an executable file named exactly `td-<name>` at its root (`td-<name>.exe` for Windows binaries).
- The command is the name without the prefix: `td-standup` becomes `td standup`.
- `<name>` must not match a built-in command or alias (`task`, `project`, `today`, `extension`, `ext`, and so on). Install refuses reserved names. If a later `td` release adds a built-in with your extension's name, the built-in wins, `td extension list` marks your extension as shadowed, and users can still reach it with `td extension exec <name>`.

## How td runs your extension

```bash
td standup --since yesterday --json
td --user you@example.com standup   # global flags go before the name
```

- **Arguments.** Everything after the name reaches you verbatim, including `--help`, `--json`, and `--user`. `td` does not parse, validate, or reorder any of it. Global `td` flags placed _before_ the name are consumed by `td`. Only `--user`, `--accessible`, `--verbose`, and `--no-spinner` reach you, as environment variables (see below). Output-mode flags such as `--json` or `--quiet` placed before the name are consumed and not passed on.
- **Streams.** Your process inherits `td`'s stdin, stdout, and stderr. `td` writes nothing to either output stream on success, so `td standup --json | jq` works.
- **Exit code.** `td` exits with your exit code. If your process is killed by a signal, `td` exits with `128 + signal`.
- **No spinner.** `td` starts nothing on the terminal before handing over. The terminal is yours.
- **How it is launched.**
    - A script with a `node` shebang is always run with the same Node binary `td` runs on, on every platform. This is what makes Node extensions work on Windows.
    - Any other executable is spawned directly.
    - On Windows, other scripts (bash, Python, and so on) are run through `sh.exe` when it is on `PATH` (Git for Windows provides it). If it is not, dispatch fails with `EXTENSION_NEEDS_SHELL`. Compiled `.exe` binaries avoid this.

## Environment

Your process gets the user's environment plus:

| Variable            | Example                          | Use                                                                                                                                                                                                                              |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TD_EXTENSION`      | `1`                              | You were launched by `td`. Use it to adjust usage strings, skip your own update checks, and so on                                                                                                                                |
| `TD_EXTENSION_NAME` | `standup`                        | The command name you were run as                                                                                                                                                                                                 |
| `TD_EXTENSION_DIR`  | `/home/you/.local/share/…`       | Your extension's directory, for locating bundled assets                                                                                                                                                                          |
| `TD_NODE`           | `/usr/local/bin/node`            | The Node binary running `td`                                                                                                                                                                                                     |
| `TD_PATH`           | `/usr/local/lib/…/dist/index.js` | `td`'s entry script. Use it with `TD_NODE` to call `td` back (see below)                                                                                                                                                         |
| `TD_VERSION`        | `5.4.1`                          | The running `td` version, for feature detection                                                                                                                                                                                  |
| `TD_CONFIG_DIR`     | `/home/you/.config/todoist-cli`  | `td`'s config directory. Read only: never write here                                                                                                                                                                             |
| `TD_USER`           | `you@example.com`                | The account to act as: `--user` before your name if given, otherwise a `TD_USER` the user already exported, otherwise unset. Nested `td` data commands read it automatically, so you act as the same account without plumbing it |
| `TD_ACCESSIBLE`     | `1`                              | Set when `--accessible` was passed before your name, otherwise inherited from the user's environment. Add text labels wherever you rely on color, and drop purely visual elements                                                |

Two variables are controlled by `td` rather than inherited, so an exported value can be removed:

| Variable     | Value                                                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `TD_VERBOSE` | `1`–`4` when `-v` was passed before your name (repeat for more). Removed otherwise, even if the user exported it           |
| `TD_SPINNER` | `false` when spinners are disabled (`--no-spinner` before your name, or an exported `TD_SPINNER=false`). Removed otherwise |

Everything else the user has exported is inherited as usual.

**The API token is never injected.** Most extensions should not need it: `td … --json` covers most cases and keeps you insulated from API changes. If you do need the raw token:

- If `TODOIST_API_TOKEN` is set, the user has exported it themselves and you inherit it like any other variable. Use it directly. `td auth token view` refuses to print it (`TOKEN_FROM_ENV`).
- Otherwise run `td auth token view`. It honors `--user` but does not read `TD_USER`, so pass the account through explicitly: `td ${TD_USER:+--user "$TD_USER"} auth token view`.

## Calling td from an extension

This is how an extension gets Todoist data. Use `TD_NODE` and `TD_PATH` together. On Windows, npm installs `td` as a `.cmd` shim that cannot be spawned as a plain executable, so calling `td` from `PATH` is not portable. Fall back to `td` from `PATH` only when the variables are absent, such as when running the script by hand.

Bash:

```bash
#!/usr/bin/env bash
set -euo pipefail

td=(td)
if [[ -n "${TD_NODE:-}" && -n "${TD_PATH:-}" ]]; then
    td=("$TD_NODE" "$TD_PATH")
fi

"${td[@]}" task list --filter "today" --json --full | jq -r '.results[] | .content'
```

Node:

```js
#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const { TD_NODE, TD_PATH } = process.env
const [command, prefix] = TD_NODE && TD_PATH ? [TD_NODE, [TD_PATH]] : ['td', []]

async function td(...args) {
    const { stdout } = await run(command, [...prefix, ...args])
    return stdout
}

const projects = JSON.parse(await td('project', 'list', '--json'))
```

Tips:

- Always pass `--json` (or `--ndjson`) when you parse the output. Human-readable output can change between releases. The JSON output and error codes are a stable contract.
- List commands return `{ "results": [...], "nextCursor": ... }` in `--json` mode, not a bare array.
- Leave `--user` alone for data commands. `TD_USER` already carries the account through to nested calls. (`td auth token view` is the exception; see above.)
- On failure, `td` always exits non-zero. Errors raised by a command (not found, auth, validation) are written as a JSON envelope when called with `--json`:

    ```json
    {
        "error": { "code": "TASK_NOT_FOUND", "message": "task \"abc\" not found." }
    }
    ```

    Argument errors caught before the command runs, such as an unknown option (`td task list --bogus --json`), are plain text (`error: unknown option '--bogus'`). Check the exit code first, and do not assume stderr parses as JSON.

## Behaving like a td command

Users and AI agents will call your extension the same way they call built-in commands, so follow the same conventions:

1. **Handle `--help`.** `td <name> --help` is forwarded to you, and you are expected to print your own usage.
2. **Separate data from diagnostics.** Data goes to stdout. Progress, warnings, and errors go to stderr.
3. **Exit non-zero on failure.**
4. **Support `--json` if you output data.** When you emit JSON errors, use `td`'s shape: `{ "error": { "code": "…", "message": "…", "hints": ["…"] } }`.
5. **Never prompt when stdin is not a TTY.** `td` is non-interactive by design, and agents run extensions without a terminal. Take input from flags, and fail with a clear message when something required is missing.
6. **Respect `TD_ACCESSIBLE`.** Pair any color-coding with a text label.

Node authors who want output that matches `td` exactly can use [`@doist/cli-core`](https://www.npmjs.com/package/@doist/cli-core) for the same spinner, JSON formatting, and error classes.

## Metadata: `td-extension.json`

The file is optional. Put it at the root of your extension:

```json
{
    "manifestVersion": 1,
    "description": "Print a daily standup summary",
    "requires": { "td": ">=5.0.0" }
}
```

| Field             | Meaning                                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `manifestVersion` | Format version. Defaults to `1`                                                                                                                                           |
| `description`     | Shown in `td --help` (under `Extensions:`) and in `td extension list --json`. Without it, `td --help` shows `Extension <name>`                                            |
| `requires.td`     | A semver range. If the running `td` does not satisfy it, `td` prints a warning to stderr and still runs your extension. To enforce the range, check `TD_VERSION` yourself |

Unknown keys are ignored.

Node extensions can put the same fields under a `"td"` key in `package.json` instead of adding a second file:

```json
{
    "name": "td-standup",
    "type": "module",
    "td": {
        "description": "Print a daily standup summary",
        "requires": { "td": ">=5.0.0" }
    }
}
```

If both are present, `td-extension.json` wins.

## Dependencies

- **Node:** list dependencies in `package.json`. On install and upgrade, `td` runs `npm ci --omit=dev` when a `package-lock.json` is committed, and `npm install --omit=dev` when it is not. Lifecycle scripts run, so native modules work. Commit a lockfile for reproducible installs, and do not commit `node_modules`. If the user has no `npm`, install fails with `EXTENSION_NPM_MISSING`. If that is a concern, vendor your dependencies.
- **Other scripts:** `td` installs nothing for you. Rely only on tools you can reasonably expect to be present, or check for them and fail with a clear message on stderr.
- **Compiled binaries:** ship a static binary per platform (see below).

## Developing locally

```bash
cd ~/code/td-standup
td extension install .         # the directory must be named td-<name>
td standup                     # every edit is live; no reinstall needed
td extension exec standup      # the explicit form, useful if a built-in shadows the name
td doctor                      # checks each extension: executable present, manifest valid, not shadowed, version range met
td extension remove standup    # removes only the link, never your directory
```

A local install is a symlink (a small path file on Windows), so `td extension upgrade` skips it.

The executable must have its exec bit set (`chmod +x td-standup`). `td extension list` shows `executable: false` in `--json` output when it does not.

## Publishing

### Script extensions (git)

1. Push the directory to a GitHub repository named `td-<name>`, with the executable at the root and its exec bit committed.
2. Add the `td-extension` topic to the repository so people can find it.
3. Users install it with:

    ```bash
    td extension install owner/td-standup
    td extension install owner/td-standup --pin v1.2.0      # hold at a tag or ref
    td extension install https://git.example.com/owner/td-standup   # any git host
    ```

`td` clones the repository, runs the npm step if there is a `package.json`, and on `upgrade` runs `git pull --ff-only`. Private repositories work with the user's own git credentials. `GH_TOKEN` or `GITHUB_TOKEN` is used for GitHub API calls.

### Compiled extensions (release binaries)

When the latest GitHub release (or the release for `--pin <tag>`) has an asset for the user's platform, `td` downloads that asset instead of cloning. Name assets so they **end in** Node's `<platform>-<arch>`:

```
td-standup_v1.2.0_linux-x64
td-standup_v1.2.0_linux-arm64
td-standup_v1.2.0_darwin-arm64
td-standup_v1.2.0_darwin-x64
td-standup_v1.2.0_win32-x64.exe
checksums.txt
```

At minimum, publish `linux-x64`, `darwin-arm64`, `darwin-x64`, and `win32-x64`. Platform and arch values are Node's `process.platform` and `process.arch` (`darwin`, not Go's `macos`; `x64`, not `amd64`).

Checksums are verified when the release publishes them, either as a shared `checksums.txt` (or `*_checksums.txt`) or as a per-asset `<asset>.sha256`. Hashes must be SHA-256. Both the coreutils format (`<hash>  <name>`, as written by `sha256sum` or `shasum -a 256`) and the BSD format (`SHA256 (<name>) = <hash>`, as written by `shasum -a 256 --tag` or `openssl dgst -sha256`) are accepted. Plain `shasum` without `-a 256` produces SHA-1, which fails verification. A mismatch fails the install with `EXTENSION_CHECKSUM_MISMATCH`. If you publish a checksums file, it must list every binary asset.

Keep `td-extension.json` in the repository. `td` fetches it at the release tag to get your description and version range, because the binary cannot carry them. When no asset matches the user's platform, `td` falls back to cloning the repository, so a repository with both a script and binaries works everywhere.

### Official extensions

Extensions installed from the `Doist` organization on github.com show `✓ Todoist` in `td extension list`. The label shows who owns the source. It is not a signature, and it does not suppress the trust warning.

## Checklist

- [ ] Repository and executable are both named `td-<name>`, and the executable has its exec bit set
- [ ] `--help` prints usage
- [ ] Todoist data comes from `td … --json`, called via `TD_NODE` + `TD_PATH`
- [ ] Data goes to stdout, diagnostics to stderr, and failures exit non-zero
- [ ] `--json` is supported for data output, with `td`'s error shape
- [ ] Nothing prompts when stdin is not a TTY
- [ ] `td-extension.json` has a `description` and a `requires.td` range
- [ ] Node: `package-lock.json` is committed and `node_modules` is not
- [ ] Compiled: assets end in `<platform>-<arch>[.exe]`, and a `checksums.txt` is published
- [ ] Repository has the `td-extension` topic
