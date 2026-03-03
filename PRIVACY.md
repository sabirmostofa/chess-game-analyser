# Privacy Policy

Last updated: March 3, 2026

## Overview

This Chrome extension imports your latest public Chess.com game into Lichess analysis.

## Data stored

- `chessComUsername` is stored locally in `chrome.storage.local` so the extension can run in one click.
- `manualSelectionEnabled` is stored locally in `chrome.storage.local` to remember whether manual game picker mode is enabled.

## Data processed in memory

- When manual selection mode is used, the extension fetches your recent public Chess.com games and displays up to 10 entries in-memory for selection.
- PGN data from the selected game is processed only to open that game on Lichess analysis.
- This recent-games list and selected PGN are not persisted by the extension beyond normal browser/page runtime.

## Data transmission

The extension sends network requests only to:

- `https://api.chess.com/*` to fetch your public game archives and latest PGN.
- `https://lichess.org/*` to import/open analysis for that game.

## Data sharing and selling

- No user data is sold.
- No user data is shared with third parties beyond the above API requests required for core functionality.

## Remote code

- The extension does not download and execute remote code.

## Contact

For support, contact the extension publisher through the Chrome Web Store listing.
