# Chess.com -> Lichess One-Click Import (Chrome Extension)

This extension fetches your latest public Chess.com game via API and opens it directly on the Lichess analysis board.

## Install locally

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `/home/s/lichess-importer`.

## Use

1. Click the extension icon.
2. Enter your Chess.com username.
3. Click **Import latest game**.
4. A new tab opens on Lichess analysis with your latest game loaded.

## Notes

- Uses the public Chess.com API (`/pub/player/{username}/games/archives`).
- First tries `https://lichess.org/paste` form import (for compatibility with current Lichess flow).
- If paste import fails, falls back to direct analysis URL (`/analysis/pgn/...`) when the compact PGN URL is short enough.
- Only publicly available games can be imported.
