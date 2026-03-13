# SPZ Devpack Builder

A client-side web app that lets you upload JS, CSS, and HTML files, scans them for asset URLs, validates and downloads those assets, and packages everything into a ZIP file for easy experiment deployment.

**Version:** 1.5.0  
**Author:** Abir Maiti @ Spiralyze

---

## Features

- **Multi-file upload** — Select JS, CSS, and HTML files at once (drag & drop or click to browse)
- **Asset extraction** — Scans file contents for full URLs and relative paths
- **Asset types** — Images (PNG, JPG, SVG, WebP), fonts (WOFF2, TTF, OTF, EOT), videos (MP4, WebM, OGG), GIFs, JSON (Lottie animations), CSS, and JS
- **Cloudinary support** — Media assets are only downloaded from `res.cloudinary.com/spiralyze/`; JS and CSS can come from any domain
- **URL resolution** — Full URLs are used as-is; relative paths are resolved with the correct Cloudinary base (`image/upload` for images, `raw/upload` for JSON)
- **404 retry** — Automatically retries failed fetches up to 3 times
- **Asset preview** — Collapsible accordions with image thumbnails and link lists
- **Failed downloads** — Failed URLs are listed separately with manual retry links
- **ZIP output** — Organized folder structure with a custom devpack name

---

## Requirements

- **Chromium-based browser** (Chrome or Edge recommended)
- No server or build step — open `index.html` directly in the browser

---

## How to Use

1. **Open** `index.html` in Chrome or Edge (double-click or drag into browser).

2. **Choose filters** — Check which asset types to include (JS, CSS, Images, Fonts, Videos, GIFs, JSON). Use "Select All" for a quick toggle.

3. **Upload files** — Drag & drop or click the dropzone to select `.js`, `.css`, or `.html` files.

4. **Scan & Validate** — Click to extract URLs, fetch assets, and validate. Successful assets appear in accordions; failed ones go to "Failed Downloads".

5. **Proceed to Download** — Enter a devpack name (e.g. `my-devpack`) and click "Download ZIP".

6. **Clear All** — Resets the app for a new session.

---

## ZIP Output Structure

```
{name}-devpack/
├── script.js          # Your uploaded JS files
├── style.css          # Your uploaded CSS files
├── script/            # External JS assets
├── style/             # External CSS assets
└── assets/
    ├── images/        # PNG, JPG, SVG, WebP
    ├── fonts/         # WOFF2, TTF, OTF, EOT
    ├── videos/        # MP4, WebM, OGG
    ├── gifs/          # GIF files
    └── json/          # JSON (e.g. Lottie animations)
```

---

## URL Handling

| Source in file | Behavior |
|----------------|----------|
| Full URL (`https://res.cloudinary.com/...`) | Used as-is |
| Relative path (e.g. `path/to/file.json`) | Resolved with `raw/upload/` (JSON) or `image/upload/` (images) |
| Path with `raw/upload/` or `image/upload/` | Prepended with Cloudinary base only |

---

## Project Structure

```
SPZ-Devpack-Builder/
├── index.html          # Main app
├── js/
│   ├── app.js          # Core logic
│   └── contributors.js # Contributors display
├── styles/
│   ├── app.css
│   └── contributors.css
├── images/             # App assets
└── README.md
```

---

## Dependencies

- [JSZip](https://stuk.github.io/jszip/) — ZIP generation
- [FileSaver.js](https://github.com/eligrey/FileSaver.js/) — Save file to disk

Both are loaded from CDN; no npm install required.

---

## License

© 2025 Spiralyze LLC. An experimental tool by SPZ Dev Team.
