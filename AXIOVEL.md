# Axiovel fork of Skybrush Live

Axio Control is Axiovel's production ground GUI for indoor drone-light shows.
It is developed inside the AxioStack superproject, which pins it together with
`axio-server`, the RTLS firmware and ArduPilot. Cross-repo facts (message
formats, show files, timing, simulation) live in AxioStack `contracts/`, not
here.

## What the fork adds

| Area                                                                            | Code                                    | Contract (AxioStack `contracts/`)                                      |
| ------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| RTLS tags and anchors panels, fleet health, anchor health and manual sleep/wake | `src/features/rtls/`, `src/views/rtls/` | `rtls-fleet-health.md`, `rtls-geometry-stats.md`, `rtls-client-api.md` |
| `.gdm` shows: load, preview, upload gate                                        | `src/features/show/gdm/`                | `gdm-format.md`, `show-artifacts.md`                                   |
| Show music on the server's player                                               | `src/features/show-audio/`              | `show-timing.md`                                                       |
| ArduPilot flight-firmware update                                                | `src/features/firmware-update/`         | none; the server's `X-AP-OTA` handler is the other half                |
| In-app E2E bridge                                                               | `src/e2e/` (see its README)             | `control-e2e-bridge.md`                                                |

## Rules

- Keep upstream compatibility: protocol identifiers, file formats and the
  `@skybrush` packages stay as upstream has them.
- Keep upstream-owned files close to upstream so merges stay cheap. Fork notes
  go in this file or next to fork code, never in `CHANGELOG.md`; upstream's
  `AGENTS.md` carries only the pointer to this file.
- The GUI never writes anchor geometry. Tags fit the cell themselves; the GUI
  only shows the fit and the fleet agreement verdict.
- The ground only monitors devices and sends the operator's explicit commands;
  nothing in Control acts on a device by itself. Sleeping anchors always asks
  first, and `SLEEP` is never written from the parameter dialog.
- Nothing in application code imports `src/e2e/`; the bridge is compiled in
  only with `AXIO_E2E=1`.

## Build, run, test

Upstream's `AGENTS.md` says never to build, run or add tests. That does not
apply here: test what you change, in simulation first, then on hardware.

- `npm test` runs Jest. CI does not run it; CI runs only `format:check`,
  `lint:check` and `type:check`, so run all four yourself.
- To see a change working, drive the app through the `axio-e2e` harness
  (`repos/sw/axio-e2e`). It builds Control with the bridge, starts a server at
  the fidelity you pick (`mock`, `virtual` or `sim`) and gives back state and
  screenshots. Only the `sim` profile says anything about the production stack.
