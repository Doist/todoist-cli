# td-{{NAME}}

{{DESCRIPTION}}

## Install

```bash
td extension install {{OWNER}}/td-{{NAME}}
```

## Develop

```bash
td extension install .   # symlinks this directory, so every edit is live
td {{NAME}}
```

## Publishing

Push this to a repository named `td-{{NAME}}` and add the `td-extension`
topic, which is how `td extension search` finds it.

## Notes

- Everything after `td {{NAME}}` reaches this script untouched, `--help`
  included. Global flags belong before the name: `td --user you@example.com
{{NAME}}`.
- Write data to stdout and diagnostics to stderr, and exit non-zero on
  failure. td exits with whatever this script exits with.
- Do not prompt when stdin is not a TTY — td is non-interactive by design and
  agents call extensions.
- Dependencies go in `package.json`; td runs `npm ci --omit=dev` when it
  installs the extension, so they do not need vendoring.
