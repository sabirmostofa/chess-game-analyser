# Chess.com -> Lichess One-Click Import (Chrome Extension)

Import Chess.com games to Lichess analysis in one click.

## Features

- One-click import from the extension icon.
- Optional manual mode: choose from your last 10 games.
- Manual selection mode toggle auto-saves when changed.
- Username validation against Chess.com when saving settings.
- Preserves username letter case and removes whitespace.
- Uses Lichess import flow and opens analysis for the imported game.
- Auto-opens black games with black board orientation on Lichess.
- Fallback to direct compact PGN analysis URL if form import fails.
- Opens imported game tabs in the same browser window context when possible.

## Install (local)

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this extension folder.

## Pin the extension

1. In Chrome toolbar, click the puzzle-piece icon (**Extensions**).
2. Find `Chess.com -> Lichess One-Click Import`.
3. Click the pin icon so it stays visible in toolbar.

## First-time setup

1. Open extension settings:
   `chrome://extensions` -> this extension -> **Extension options**.
2. Enter your Chess.com username.
3. Click **Save settings**.
4. (Optional) Enable **Manual selection mode (choose from last 10 games)**.

## How to use

1. Click the extension icon.
2. If manual mode is OFF:
   it imports your latest Chess.com game and opens Lichess analysis.
3. If manual mode is ON:
   it shows your last 10 games (opponent, color, result); click one to import/open analysis.

## Popup behavior

The username popup appears only when:

- no username is saved
- username is invalid/not found
- Chess.com API or Lichess import fails

## Technical notes

- Uses Chess.com public API: `https://api.chess.com/pub/player/{username}/games/archives`
- Primary import path: `https://lichess.org/paste` -> `/import`
- Successful import opens white/default: `https://lichess.org/<game-id>`
- Successful import opens black: `https://lichess.org/<game-id>/black`
- Fallback import path: `https://lichess.org/analysis/pgn/<compact-pgn>`
- Only publicly available Chess.com games can be imported

## Troubleshooting

- If the Lichess board does not load correctly, refresh the page or press `F5`.

## Chrome Web Store files

- Extension icons: `icons/`
- Privacy policy template: `PRIVACY.md`
- Publish checklist: `WEBSTORE_CHECKLIST.md`
- Web Store package scripts:
  - `scripts/package-webstore.sh` (macOS/Linux)
  - `scripts/package-webstore.bat` (Windows)
