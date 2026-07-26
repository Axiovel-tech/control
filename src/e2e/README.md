# E2E automation bridge

This directory is the app-side half of the end-to-end testing setup. The other
half — the Playwright SDK, the stack orchestrator and the `axio-e2e` CLI —
lives in the separate `axio-e2e` repository, which consumes everything
documented here as a contract.

Nothing in this directory is imported by application code. The bridge observes
the app; it never participates in it.

## Enabling the bridge

The bridge is compiled in only when the bundle is built with `AXIO_E2E=1`:

```sh
npm run start:e2e     # webpack dev server on :8080, bridge enabled
```

`webpack.EnvironmentPlugin` substitutes a literal for `process.env.AXIO_E2E`,
so a normal build collapses the guard in `index.ts` to `'0' === '1'` and the
minifier drops the branch together with everything it references. Shipped
bundles therefore carry no test surface.

`AXIO_E2E=1` additionally changes three things, each because the default is
hostile to automation rather than because tests want special treatment:

| Setting                                     | Effect                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AXIO_E2E_SERVER_PORT`                      | Overrides the auto-connect port (`config/baseline.ts`). Without it a test build connects to the standard port on load — which on a development bench is the operator's live server, not the test one. |
| `ReactRefreshWebpackPlugin({overlay:false})` | The refresh overlay is a fixed, full-viewport iframe at maximum z-index, mounted whether or not there is an error to show, so it swallows every click.                                              |
| `react-error-overlay` not started           | Same problem, different overlay: `splash.jsx` skips `startReportingRuntimeErrors`. Runtime errors go to the console instead.                                                                        |

The dev server's own error overlay is a fourth such iframe; the harness passes
`--no-client-overlay` rather than configuring it here.

## `window.__AXIO_E2E__`

See `types.ts` for the authoritative definition. In short:

| Member              | Purpose                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `version`           | Contract version; the harness refuses an unrecognized major.                             |
| `getState(path?)`   | JSON-safe Redux state, optionally a lodash path such as `uavs.byId`.                     |
| `dispatch(action)`  | Dispatches a plain (serializable) action. Thunks cannot cross the bridge.                |
| `mapProbe()`        | View parameters plus every identified map feature, in both lon/lat and viewport pixels.  |
| `messages(filter?)` | Recorded Flockwave traffic, both directions.                                             |
| `clearMessages()`   | Resets the recording.                                                                    |
| `sendMessage(body)` | Sends a Flockwave message through the app's own hub and resolves with the response body. |
| `isReady()`         | True once persisted state has been restored.                                             |

There is deliberately **no `waitFor`** here: Playwright's `page.waitForFunction`
already polls in-page, so the waiting primitive belongs in the harness rather
than in shipped app code.

### Why a map probe

The map is a canvas, so a test cannot reach its contents through the DOM.
Rather than pixel-diffing, `mapProbe()` reports where each feature _is_, and
assertions are made on numbers. Screenshots stay for human review only.

### Why a message tap

Asserting that a dialog closed does not prove the GUI asked the server to do
anything. The tap records what actually went over the wire, so a test can
assert on, say, an outgoing `X-RTLS-GEO` request rather than on its UI
side-effects.

## Selector contract

Prefer role- and name-based locators. Where the DOM is genuinely ambiguous, the
app carries stable hooks that the SDK depends on. Changing or removing one of
these is a breaking change for the harness.

### `data-testid`

| Test id                          | Element                                                                 |
| -------------------------------- | ----------------------------------------------------------------------- |
| `show-control.load-show`         | Show Control → load show from file (the file input is nested inside it) |
| `show-control.environment`       | Show Control → environment setup                                        |
| `show-control.adapt-to-venue`    | Show Control → adapt to venue (outdoor only)                            |
| `show-control.takeoff-area`      | Show Control → takeoff area setup                                       |
| `show-control.geofence`          | Show Control → geofence setup (outdoor only)                            |
| `show-control.upload`            | Show Control → upload show data                                         |
| `show-control.onboard-preflight` | Show Control → onboard preflight checks                                 |
| `show-control.manual-preflight`  | Show Control → manual preflight checks                                  |
| `show-control.start-time`        | Show Control → start time                                               |
| `map.fit-all-features.all`       | Map toolbar → fit all features                                          |
| `map.fit-all-features.drones`    | Map toolbar → fit all drones                                            |
| `header.server-connection`       | Header → server connection settings (opens the server dialog)           |
| `server-settings.dialog`         | The server settings dialog itself                                       |
| `server-settings.tab.auto`       | Server settings → auto-discovery tab                                    |
| `server-settings.tab.manual`     | Server settings → manual entry tab (hostname/port only exist here)      |

### Pre-existing stable hooks

These were already in the app and are relied upon rather than re-invented:

| Selector                                       | Element                                                  |
| ---------------------------------------------- | -------------------------------------------------------- |
| `#global-dom-node-uav-<id>`                    | UAV list item for UAV `<id>` (see `views/uavs/utils.ts`) |
| `input[name="hostName"]`, `input[name="port"]` | Server settings dialog, manual tab                       |
| `#show-file-upload`                            | Label wrapping the show file input                       |

## Changing the contract

`BRIDGE_PROTOCOL_VERSION` in `types.ts` is the version the harness checks. Bump
it when an existing member changes shape or is removed; adding a new member
does not require a bump.
