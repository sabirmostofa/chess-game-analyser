# Chrome Web Store Release Checklist

## Extension package (in this repo)

- Manifest is MV3 and includes required fields.
- Extension icons are in `/icons`:
  - `icons/icon16.png`
  - `icons/icon32.png`
  - `icons/icon48.png`
  - `icons/icon128.png`
- Options page exists (`options.html`) and one-click behavior is active.

## Store listing assets (create these before upload)

Create a folder `store-assets/` and place:

- `store-assets/screenshot-1.png` (required, at least 1 screenshot)
- `store-assets/screenshot-2.png` (recommended)
- `store-assets/screenshot-3.png` (recommended)
- `store-assets/tile-small-440x280.png` (recommended promo tile)
- `store-assets/tile-large-920x680.png` (optional)
- `store-assets/marquee-1400x560.png` (optional)

## Text you need in Chrome Web Store

- Extension name
- Short description (max 132 chars)
- Detailed description
- Category (usually `Productivity`)

Suggested short description:

`One-click import of your latest Chess.com game to Lichess analysis with saved username settings.`

## Privacy / data disclosure

In the Web Store privacy section, declare:

- Data is not sold.
- No personal/sensitive data is collected by the extension backend.
- Stored locally: `chessComUsername` in `chrome.storage.local`.
- Network calls only to:
  - `https://api.chess.com/*`
  - `https://lichess.org/*`

If Web Store requires a privacy policy URL, publish `PRIVACY.md` on a public URL (for example GitHub Pages or a public gist) and provide that link.

## Build ZIP for upload

Run from project root:

```bash
cd /home/s/lichess-importer
zip -r lichess-importer-webstore.zip . \
  -x "*.git*" \
  -x "store-assets/*" \
  -x "*.DS_Store"
```

Upload `lichess-importer-webstore.zip` in Chrome Web Store Developer Dashboard.
