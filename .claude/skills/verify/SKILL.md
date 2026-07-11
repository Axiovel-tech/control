---
name: verify
description: How to build, launch, and drive this app (Skybrush Live fork) to verify UI changes end-to-end with a real server and virtual drones.
---

# Verifying changes in the control app

## Launch the web build

```bash
npm start          # rimraf build && webpack serve (browser config), serves http://localhost:8080
```

First compile takes ~1-2 min; wait for `[webpack.Progress] 100%` in the log.
The web build auto-connects to a Skybrush server at `ws://localhost:5000`.

## Launch a server with virtual drones

axio-server lives at `/home/singu/dev/fw/axiovel/axio-server` with a ready venv:

```bash
/home/singu/dev/fw/axiovel/axio-server/.venv/bin/skybrushd -c <config.jsonc>
```

Config for N virtual drones on a grid at a known origin/orientation:

```jsonc
{
  "EXTENSIONS": {
    "http_server": { "host": "localhost", "port": 5000 },
    "virtual_uavs": {
      "enabled": true,
      "count": 20,
      "id_format": "{0:03}",
      "origin": [2.1734, 41.3851, 100],   // lon, lat, AMSL
      "orientation": 30,
      "takeoff_area": { "type": "grid", "spacing": 5 }
    }
  }
}
```

`place_drones(count, type='grid', spacing=s)` puts drones at x ∈ {0..}, y ∈ {0..}
(corner at origin, 4 columns for 20 drones), in the NWU frame of `origin`/`orientation`.

## Drive it with Playwright

Playwright 1.61 works with the system Chrome: `chromium.launch({ channel: 'chrome', headless: true })`.
Install `playwright` into a scratch dir (`npm i playwright`), no browser download needed.

- Load a show: `page.locator('input[type="file"]').first().setInputFiles('demo.skyc')`
  (the visible `#show-file-upload` element is a label, not the input).
- A sample outdoor 20-drone show (4×5 grid, 5 m spacing, homes centered on origin):
  `assets/shows/demo.skyc` under the `.autodev/worktrees/run-*` copies of this repo.
- Show Control panel buttons are `.MuiListItemButton-root` items; disabled state shows
  as `Mui-disabled` in the class list. Tooltips render into `[role="tooltip"]` /
  `[data-tippy-root]` nodes.
- The map "fit all features" button is the crosshair at ~(257, 100); zoom "+" at ~(68, 88)
  in a 1600×900 viewport.

## Gotchas

- `socket.io` connection-refused console errors just mean no server on :5000.
- Redux state is not persisted to localStorage in the dev web build, so verify
  state changes via the UI (dialogs, status lights, map markers), not storage.
- Jest ESM: new deps imported by tested modules may need to be added to
  `transformIgnorePatterns` in `jest.config.ts`.
