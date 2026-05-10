# TAMARACK Knowledge HUD

TAMARACK is a local Electron knowledge base for operational notes, code snippets, and review-first shell helpers.

The app now includes a **Safe Shell Snippets** system for storing aliases, zsh functions, Git shortcuts, SSH shortcuts, npm helpers, and config-editing references without pushing anything directly into your live `~/.zshrc`.

## What the App Does

- Opens a manager window for local notes and code entries.
- Stores saved entries in Electron `userData` as `library.json`.
- Provides a dark HUD overlay for fast search with local shortcuts.
- Includes a repo-backed Safe Shell Snippets library in `data/shell-snippets.json`.
- Generates a copyable zsh export block in the UI.
- Never writes to your real `~/.zshrc` automatically.

## Features

- **Knowledge entry manager**: Add, edit, and delete notes or code snippets.
- **HUD overlay**: Search saved notes and shell snippets from the overlay.
- **Safe Shell Snippets**: Grouped by category with risk badges, notes, and copy buttons.
- **Generated export**: Build a `~/.zshrc` block for manual copy only.
- **Safety-first workflow**: Snippets stay reference material until you install them yourself.

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Import an existing web `library.json` if you have one already:

   ```bash
   npm run import
   ```

3. Start the app:

   ```bash
   npm start
   ```

## Usage

### HUD access

- Use `F12` in the main window as the most reliable local shortcut.
- `Ctrl+Shift+0` may work globally depending on your Linux setup.
- Click **Show HUD** in the manager window if global shortcuts are limited.

### Knowledge entries

- Use the left sidebar to add notes or code entries.
- Click an entry to inspect it, then edit or delete it from the detail pane.

### Shell snippets

- Open the **Shell Snippets** panel in the main manager window.
- Filter snippets by title, code, tags, notes, platform, or risk level.
- Copy an individual alias/function or copy the generated export block.
- Review the risk badge and notes before installing anything into `~/.zshrc`.

## What Shell Snippets Are

Shell Snippets are structured, reviewable references for commands you may want later, not commands the app should execute for you.

Each snippet supports:

- `id`
- `title`
- `category`
- `description`
- `code`
- `riskLevel` with `safe`, `caution`, or `dangerous`
- `platform` with `mac`, `linux`, or `both`
- `tags`
- `notes`
- `createdAt`
- `updatedAt`

The current snippet library lives in [data/shell-snippets.json](/home/tom/blackbird_dev/TAMARACK/data/shell-snippets.json).

## Safety Rules

- Do not paste large blocks directly into a live terminal session.
- Edit `~/.zshrc` intentionally with `nano ~/.zshrc` or another editor you trust.
- Review every alias and function before installing it.
- Avoid overriding destructive commands unless the snippet is clearly marked and justified.
- Aliases that wrap `rm` or other destructive commands should be treated as caution or dangerous.
- Snippets stay reference material until you explicitly copy them into `~/.zshrc` yourself.

## Add a New Snippet

1. Open [data/shell-snippets.json](/home/tom/blackbird_dev/TAMARACK/data/shell-snippets.json).
2. Add a new object under `snippets`.
3. Pick the correct `category`, `riskLevel`, and `platform`.
4. Add notes that explain hidden assumptions, side effects, or recovery steps.
5. Restart the app so the renderer and HUD pick up the updated data.

Example shape:

```json
{
  "id": "git-gs",
  "title": "Git status",
  "category": "git shortcuts",
  "description": "Show the current repository status.",
  "code": "alias gs='git status'",
  "riskLevel": "safe",
  "platform": "both",
  "tags": ["git", "status"],
  "notes": "Safe read-only shortcut.",
  "createdAt": "2026-05-09",
  "updatedAt": "2026-05-09"
}
```

## Safely Install a Snippet into ~/.zshrc

1. Review the snippet's risk badge, description, and notes in TAMARACK.
2. Copy either a single snippet or the generated export block from the UI.
3. Open your shell config intentionally:

   ```bash
   nano ~/.zshrc
   ```

4. Paste only the lines you have reviewed.
5. Save the file.
6. Run a syntax check before reloading:

   ```bash
   zsh -n ~/.zshrc
   ```

7. If the syntax check passes, reload it:

   ```bash
   source ~/.zshrc
   ```

You can also open a fresh terminal instead of sourcing immediately.

## Recover If a Bad Alias Breaks Behavior

1. Start a clean shell that ignores your normal config:

   ```bash
   zsh -f
   ```

2. Edit `~/.zshrc` and remove or comment out the bad alias/function.
3. Re-run `zsh -n ~/.zshrc` to confirm the file parses.
4. Reload with `source ~/.zshrc` or open a fresh terminal.
5. In an already-open shell, use `unalias name` to disable a bad alias temporarily.
6. Use `command ls` or the full executable path when you need to bypass an alias for one command.

## File Guide

- [main.js](/home/tom/blackbird_dev/TAMARACK/main.js): Electron main process, windows, shortcuts, IPC handlers.
- [index.html](/home/tom/blackbird_dev/TAMARACK/index.html): Manager UI, shell snippet panel, copy/export actions.
- [hud.html](/home/tom/blackbird_dev/TAMARACK/hud.html): HUD overlay search UI.
- [shell-snippets.js](/home/tom/blackbird_dev/TAMARACK/shell-snippets.js): Shell snippet loader, export builder, HUD entry adapter.
- [data/shell-snippets.json](/home/tom/blackbird_dev/TAMARACK/data/shell-snippets.json): Structured shell snippet library.
- [import-library.js](/home/tom/blackbird_dev/TAMARACK/import-library.js): Optional import helper for an existing `library.json`.

## Development Notes

- The root app is the live Electron app for this repo.
- `knowledge-hud/` exists as a separate untracked parallel copy and is not required for the root app to run.
- `scripts/generate-release-manifest.js` is unrelated to shell snippet installation and was left alone.

## Requirements

- Node.js 14+
- Electron dependencies from `npm install`
- A Linux desktop session for the HUD window and shortcut behavior
