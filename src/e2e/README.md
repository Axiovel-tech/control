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

The swap happens at **module resolution**, not at runtime: `webpack/base.config.js`
aliases `~/e2e` to `disabled.ts` unless `AXIO_E2E=1`, so a normal build never
resolves this directory at all and emits none of it anywhere.

A runtime guard was tried first and is not sufficient. The minifier does erase
`if ('0' === '1')`, but chunk assignment happens earlier, and by then the
bridge's static imports of the store and the message hub had already dragged
the whole application graph out of the lazily-loaded workbench chunk and into
the initial bundle — `app.bundle.js` measured 645 KB before and 2.28 MB after,
defeating the code split the splash screen exists for.

`AXIO_E2E=1` additionally changes three things, each because the default is
hostile to automation rather than because tests want special treatment:

| Setting                                      | Effect                                                                                                                                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AXIO_E2E_SERVER_PORT`                       | Sets the auto-connect endpoint (`config/baseline.ts`). Given no valid port, an E2E build turns auto-connect **off** rather than falling back: `sagas/onboarding.js` resolves an unset or unparseable port to 5000, which on a development bench is the operator's live server. |
| `ReactRefreshWebpackPlugin({overlay:false})` | The refresh overlay is a fixed, full-viewport iframe at maximum z-index, mounted whether or not there is an error to show, so it swallows every click.                                                                                                                         |
| `react-error-overlay` not started            | Same problem, different overlay: `splash.jsx` skips `startReportingRuntimeErrors`. Runtime errors go to the console instead.                                                                                                                                                   |

The dev server's own error overlay is a fourth such iframe; the harness passes
`--no-client-overlay` rather than configuring it here.

## `window.__AXIO_E2E__`

See `types.ts` for the authoritative definition. In short:

| Member              | Purpose                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `version`           | Contract version; the harness refuses an unrecognized major.                                     |
| `getState(path?)`   | JSON-safe Redux state, optionally a lodash path such as `uavs.byId`.                             |
| `dispatch(action)`  | Dispatches a plain (serializable) action. Thunks cannot cross the bridge.                        |
| `mapProbe()`        | View parameters plus every identified map feature, in both lon/lat and viewport pixels.          |
| `messages(filter?)` | Recorded Flockwave traffic, both directions. Filter by `type`, `direction`, `origin` or `since`. |
| `clearMessages()`   | Drops the recording. Sequence numbers keep counting, so a `since` cursor stays valid.            |
| `sendMessage(body)` | Sends a Flockwave message through the app's own hub and resolves with the response body.         |
| `isReady()`         | True once persisted state has been restored.                                                     |

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

Two details keep that evidence honest. Outbound messages are recorded only when
the hub actually has an emitter — both send paths discard silently while
disconnected, and recording those would let a test "observe" a message that was
never sent. And every record carries an `origin`, so traffic the harness itself
injected through `sendMessage()` cannot be mistaken for something the GUI did.

## Selector contract

Prefer role- and name-based locators. Where the DOM is genuinely ambiguous, the
app carries stable hooks that the SDK depends on. Changing or removing one of
these is a breaking change for the harness.

### `data-testid`

| Test id                          | Element                                                                                                                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `show-control.load-show`         | Show Control → load show from file (the file input is nested inside it)                                                                                                                |
| `show-control.environment`       | Show Control → environment setup                                                                                                                                                       |
| `show-control.adapt-to-venue`    | Show Control → adapt to venue (outdoor only)                                                                                                                                           |
| `show-control.takeoff-area`      | Show Control → takeoff area setup                                                                                                                                                      |
| `show-control.geofence`          | Show Control → geofence setup (outdoor only)                                                                                                                                           |
| `show-control.upload`            | Show Control → upload show data                                                                                                                                                        |
| `show-control.onboard-preflight` | Show Control → onboard preflight checks                                                                                                                                                |
| `show-control.manual-preflight`  | Show Control → manual preflight checks                                                                                                                                                 |
| `show-control.start-time`        | Show Control → start time                                                                                                                                                              |
| `map.fit-all-features.drones`    | Map toolbar → fit all features. The id carries the button's `target` prop, and the one instance the layout renders uses the default, `drones` — there is no `.all` variant in the DOM. |
| `header.server-connection`       | Header → server connection settings (opens the server dialog)                                                                                                                          |
| `server-settings.dialog`         | The server settings dialog itself                                                                                                                                                      |
| `server-settings.tab.auto`       | Server settings → auto-discovery tab                                                                                                                                                   |
| `server-settings.tab.manual`     | Server settings → manual entry tab (hostname/port only exist here)                                                                                                                     |

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
