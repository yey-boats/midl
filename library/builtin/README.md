# Built-in screen records

The screens every Yey Boats display ships with, as MIDL documents. Each
`<id>.midl.json` file is one **embedded record**: one MIDL document holding one
screen.

## Who consumes them

- **Firmware** (`yey-boats/instruments`) embeds these files at build time
  through the `midl` submodule. They are the device's factory screens and the
  fallback when a stored record fails to render.
- **Display Manager** (`yey-boats/Instruments-manager`) lists them as its
  built-in presets. The default profile refers to them by id, so a device on
  the default profile needs nothing pushed.

A manager or local record with the same id as a built-in overrides it on the
device. Deleting the override brings the built-in back.

## Rules

- File name = record id = the id of the document's single screen.
  Record ids match `[a-z0-9_-]{1,32}`. Screen ids are unique across all
  built-ins.
- Every screen has a `title` (shown in the carousel and in DM).
- Each screen lists a `variants` entry for every class it ships on:
  - `dashboard`, `wind`, `wind_classic`, `wind_steer`, `nav`, `depth`,
    `steering`, `route`, `autopilot`, `trip`, `status`: `square-480`,
    `landscape-800x480`, `landscape-1024x600`;
  - `ap_hud`, `knob_compass`, `knob_wind`, `knob_big` (knob views):
    `round-360`.
- The base `layout` is a copy of the first variant's layout.
- `status` and `trip` bind device-local ids (`{kind: "local", id: ...}`).
  `status` uses text-valued ids (`net.ip`, `net.ssid`, `net.rssi`, `sk.state`,
  `sk.host`, `sys.heap`, `sys.uptime`, `sys.version`, `sys.build`). `trip` uses `trip.distance` (nm), `trip.avgSpeed` and
  `trip.maxSpeed` (kn) as numbers in display units, and `trip.underway` as
  text. The device renders `--` for an id it does not know.
- Course-adjust buttons use `command` actions the firmware console runs:
  `autopilot heading <n>`, `autopilot tack`, `autopilot gybe`.

## Validate

```sh
npm test -w @yey-boats/midl          # includes ts/test/builtin.test.ts
```

`ts/test/builtin.test.ts` checks that the id set is complete, that each file
name matches its single screen id, that screen ids are unique, and that each
document passes `validateDocument` (schema, semantics and capability
satisfaction) for every class it declares, against
`schemas/gen/yb-midl-capabilities.<class>.json`.
