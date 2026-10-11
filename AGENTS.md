# File Mover repository guide

## Project overview

File Mover is a dependency-free static PWA written in HTML, CSS, and browser JavaScript.
It uses Firebase Authentication and Firestore, plus Cloudinary for file storage.

## Important files

- `index.html`: UI markup and styles.
- `script.js`: application behavior.
- `backend.js`: Firebase and Cloudinary integration.
- `manifest.json` and `service-worker.js`: PWA metadata and offline cache.
- `icon-192.png` and `icon-512.png`: installable app icons.

## Development

No dependency installation or build step is required.

Start a local server from the repository root:

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173/`.

## Validation

Run the repository check before finishing any code change:

```bash
bash scripts/validate.sh
```

For UI changes, also inspect the page at desktop and mobile widths when browser tools are available.

## Change guidelines

- Keep the app dependency-free unless the task clearly requires otherwise.
- Preserve browser-native ES modules and the static hosting structure.
- Never commit Firebase admin credentials, Cloudinary API secrets, `.env` files, or generated user data.
- The Firebase web configuration in `backend.js` is a public client configuration, not an admin credential.
- Keep the versionless `filemover-runtime` cache name stable. The network-first worker refreshes cached production assets automatically; do not add release-number cache names.
- Keep `manifest.json` valid JSON and keep icon files at their declared dimensions.
- Do not rename root assets without updating `index.html`, `manifest.json`, and the service-worker cache list.

## Delivery

Changes merged or pushed to `main` are deployed by the GitHub Pages workflow in
`.github/workflows/pages.yml`. Prefer a pull request for substantial changes; small,
explicitly requested fixes may be committed directly when the user asks for deployment.
