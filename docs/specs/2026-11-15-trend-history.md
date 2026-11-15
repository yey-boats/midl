# Trend history — contract (2026-11-15)

Owner decisions (2026-11-15):
- **Extend `trend`** (no new element). Existing docs keep working.
- **Backfill** from the SignalK History API when the server has a provider; else start empty.
- **Memory only** on the device: history is lost on reboot (no flash writes).
- **Record only for the screen on display** (device). Switching screens drops the old series
  and starts (and backfills) the new ones.

## 1. MIDL document

A `trend` element gains an optional `history` object and may use `style.range`:

```yaml
tws:
  type: trend
  name: TWS 10m
  format: { unit: kn, decimals: 1 }
  bindings:
    value: { kind: signalk, path: environment.wind.speedTrue }
  history:
    window: 10m        # duration: "<n>s" | "<n>m" | "<n>h", or a number of seconds
    agg: avg           # avg | min | max | last   (default avg)
  style:
    range: [0, 30]     # optional, in DISPLAY units (after format.unit). Absent = auto.
```

- `history` absent → `window: 10m, agg: avg` (old docs get a 10-minute time window).
- `window` must be ≥ 60 s and ≤ the class's `history.maxWindowS` (validation error above it).
- `agg` combines the samples that fall into one point (bucket).
- `style.range` absent = **auto**: min/max of the visible points, padded 10 % (a flat line
  gets ±1 display unit), recomputed when a point is added.
- Any `signalk` path works. `local`/`const` bindings: history is recorded the same way
  (no backfill).

## 2. Capability manifest

Top level (per board/class manifest, generated from `cpp/include/yb_midl_catalog.h`):

```json
"history": { "points": 120, "maxSeries": 6, "maxWindowS": 86400,
             "windows": ["10m", "30m", "1h", "6h", "24h"], "backfill": true }
```

- `points`: points per chart (bucket count). `step = window / points` (10m → 5 s).
- `maxSeries`: most trend tiles with history on one screen. Extra tiles show the number only
  (device lint warns).
- `windows`: the values the editor offers; any duration within limits validates.
- `trend` attrs become `["title", "format", "size", "unit", "color", "range", "history"]`.

Class values: square-480, landscape-800x480, landscape-1024x600: points 120, maxSeries 6;
round-360: points 90, maxSeries 2. maxWindowS 86400 everywhere.

## 3. Rendering (firmware and web the same)

- Tile: hero value + unit on top (unchanged), chart in the lower half.
- Time axis: right edge = now; the chart spans exactly `window`; points are fixed time buckets
  aligned to `floor(t / step)`. A bucket with no samples is a **gap** (line breaks); the chart
  scrolls by one bucket each `step` even when the value is steady (a steady value draws a flat
  line, it does not stop).
- Y: `style.range` or auto (above). Two small dim labels at the chart's left edge: max (top)
  and min (bottom) of the y range, in display units, same decimals as the value.
- Before any data: empty chart, no labels.
- Values are stored in SI (as received); conversion to display units happens at draw time.

## 4. Recording and backfill

Device:
- On screen show, allocate one series per trend tile (up to `maxSeries`), keyed by path+agg+window
  (two tiles with the same key share one series). Free them when the screen is left.
- Sample every incoming value into the current bucket (running avg/min/max/last).
- Backfill: on screen show, for each series, one request to the SignalK server the display is
  connected to, with the display's SignalK token (same host/port as the WS):
  `GET /signalk/v2/api/history/values?paths=<path>:<method>&duration=PT<window>S&resolution=<step>`
  where method = average|min|max|last for avg|min|max|last. Response
  `{"data": [["<ISO time>", <value>], ...]}`; each row fills its bucket unless live samples
  already filled it. Non-blocking (not on the UI loop), timeout 5 s, one retry; 404/501/empty
  data = no backfill. Never more than one request in flight.

Web (`@yey-boats/midl-web`):
- `TrendBuffers` becomes a time-bucket `HistoryStore` with the same semantics, fed on each paint
  /value change with `now` from the caller (tests inject time).
- `DataProvider` gains optional `history?(path, {window_s, step_s, agg}) => Promise<Array<[number /*ms*/, number]>>`;
  when present, the renderer backfills each series once per (key, mount).
- Hosts that keep history across re-renders pass one store instance (builder, Display Manager
  preview, /instruments page).

## 5. Editor

Inspector for a trend: **Window** select (manifest `history.windows`), **Combine** select
(avg/min/max/last), **Range** auto / fixed min–max. Device lint: series over `maxSeries`,
window over `maxWindowS`.

## 6. Out of scope (follow-ups)

- Display Manager SignalK-history provider for its preview (plugin side), and a cloud history
  provider for yey.boats.
- Persisting history across reboots (owner: no).
