# @yey-boats/midl-editor

The MIDL dashboard editor (React). Builds:

| Script | Output | Used by |
|---|---|---|
| `npm run build:lib` | `dist/` (ESM + UMD + types) | npm consumers |
| `npm run build:global` | `dist-global/midl-editor.global.js` (one IIFE, React inlined, `window.MidlEditor`) | Display Manager, web shell |
| `npm run build:device` | `device/dist/` (**committed**) | the display firmware (device-hosted editor) |

## Device-hosted editor

A standalone display (no Display Manager) serves this editor itself. The page
lists the display's screen records, edits them in the shared `MidlEditor`, and
previews them with the display's own live values. Saving a built-in screen
writes a record with the same id (an override); "Reset to built-in" deletes it.

Source: `src/device/` (`DeviceApp.tsx` UI, `device-api.ts` HTTP client,
`record-store.ts` editor adapter, `live-provider.ts` live values,
`index-ops.ts` carousel index), page template `device/index.html` +
`device/device.css`, build `scripts/build-device.mjs`.

### Output (embedded by the firmware from the midl submodule)

```
editor/device/dist/index.html.gz   the whole page: JS + CSS inlined, gzip -9
editor/device/dist/manifest.json   files, sizes, sha256
```

`manifest.json`:

```jsonc
{
  "name": "midl-device-editor",
  "budgetGzBytes": 225280,          // 220 KB: the build fails above this
  "totalGzBytes": 133000,
  "files": [{
    "path": "index.html.gz",        // relative to editor/device/dist/
    "servePath": "/editor",         // suggested URL (any path works)
    "contentType": "text/html; charset=utf-8",
    "contentEncoding": "gzip",      // serve the bytes as-is with this header
    "bytes": 485000, "gzBytes": 133000,
    "sha256": "<hex of the uncompressed page>",
    "gzSha256": "<hex of index.html.gz>"
  }]
}
```

The firmware embeds `index.html.gz` byte-for-byte and serves it with
`Content-Type: text/html; charset=utf-8` and `Content-Encoding: gzip`, behind
the same web Basic auth as the rest of the display UI. The page only calls
absolute same-origin `/api/...` URLs, so it can be served at any path.

The output is committed so the firmware build needs no Node. After changing
the editor, run `npm run build:device -w @yey-boats/midl-editor` and commit
`editor/device/dist/`. CI runs `npm run check:device`, which rebuilds, fails
above the 220 KB gzip budget, and fails when the committed output is stale
(compared on the sha256 of the uncompressed page, since gzip bytes can differ
between zlib versions).

### HTTP calls the page makes (same origin)

| When | Call |
|---|---|
| load | `GET /api/midl/manifest` (validation + element palette; the class is `classes[0].id`) |
| load, after every change | `GET /api/midl/records` |
| open a record / before every save (revision check, other screens) | `GET /api/midl/records/<id>` |
| Save | `PUT /api/midl/records/<id>` body `{title, doc}` |
| Show on display, with unsaved edits or a new record | `PUT /api/midl/records/<id>?activate=1&screen=<sid>` body `{title, doc}` |
| Show on display, nothing changed | `POST /api/screen/<sid>` (no write, no override) |
| Delete / Reset to built-in | `DELETE /api/midl/records/<id>` |
| reorder, carousel on/off, home screen | `PUT /api/midl/index` body `{order, hidden, defaultScreen?}` (full index) |
| Factory reset | `POST /api/midl/reset?to=factory` |
| live preview (~1 Hz while visible) | `GET /api/midl/live?paths=<p1,p2,...>&locals=<id1,id2,...>` |

Live values: `{t, values: {"<path>": number|string|null}, locals: {"<id>": ...}}`.
SignalK values are raw SI (the renderer converts with `format.unit` like the
display); local ids are shown as sent. `null` renders "no data". The page asks
for every path and local id the open screen binds (sorted, comma-separated,
each URL-encoded; either parameter may be absent), polls every 1 s while the
tab is visible, pauses when hidden, and backs off 2 s, 4 s, ... up to 30 s on
errors.

Errors: the page shows the firmware's `message` for `{error, message, path?,
conflictWith?, screen?}` bodies (422 `invalid_doc` with `path`, 409
`screen_id_conflict` naming `conflictWith`, 413 `too_large`, 507
`store_full`, 404 `embedded_record`). A 401 is "sign in on the display's web
page": the browser handles the Basic auth prompt and the page stores no
credentials.

Editing notes:

- The editor edits one screen at a time. A record with several screens shows
  each screen; saving splices the edited screen back into the record.
- The display renders its own class's `variants` entry. When a screen has one,
  the page edits that layout as the base layout and writes it back into the
  same variant on save (the base layout is saved with the same layout; other
  classes' variants are kept).
- Every write is validated in the page against the display's manifest before
  the PUT; the display validates again.
