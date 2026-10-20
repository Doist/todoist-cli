# Changing the CLI icon

The icon shows in three places. The repo file and the consent screen update separately.

| Where                                  | What it shows                          | How to change it                |
| -------------------------------------- | -------------------------------------- | ------------------------------- |
| README (GitHub and npm)                | `icons/td-cli.png`                     | Replace the file in a PR        |
| OAuth consent screen (`td auth login`) | A copy stored on the Todoist CLI app   | Upload it with `td apps update` |
| Sign-in result pages in the browser    | `icons/td-cli.png`, via `CLI_ICON_URL` | Replace the file in a PR        |

## 1. Export the artwork

The source is the `Size=72, Style=Color` variant of [Service / Todoist CLI](https://www.figma.com/design/xo9yAsH8PQUpi0eTJh9pmR/?node-id=12865-506) in Product Library – Global.

- Export a **512×512 PNG** for the repo.
- Export a **300×300 PNG** for the consent screen, under 300 KB. The upload rejects any other size and doesn't resize.
- Don't export SVG. The artwork uses blend modes that SVG export drops, so the tile renders pale.

## 2. Replace the repo file

Overwrite `icons/td-cli.png` with the 512px PNG, keeping the name. It's the README header and the sign-in result pages.

Never rename or delete it. npm shows each release's README with images loaded from this repo, so a renamed file breaks the image on every older release page. (The READMEs of 5.5.1 to 5.5.3 used `icons/todoist-cli_512px.png`, since removed.)

## 3. Update the consent screen

The consent screen doesn't read the repo. `td` signs in with a registered `client_id`, so Todoist shows the icon stored on that app. Only the app's owner or a Doist admin can change it. `td apps list` only shows apps you own, so an admin who doesn't own it needs the app id (`id:<app id>`) instead of the name:

```bash
td auth login --additional-scopes=app-management
```

```bash
td apps list
```

```bash
td apps update "<app name from td apps list>" --icon ./todoist-cli-300.png
```

An admin who doesn't own the app passes its id instead:

```bash
td apps update "id:<app id>" --icon ./todoist-cli-300.png
```

`--icon-size` defaults to `medium` (300×300), the slot the consent screen reads. App Management in Todoist's settings does the same thing.

Check it by starting `td auth login` and looking at the consent screen before you approve.
