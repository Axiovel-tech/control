# Standalone UI automation

This directory is the component-owned test seam for `control`. It exercises
the browser application and its real Socket.IO/Flockwave client without
requiring `axio-server`, RTLS firmware, ArduPilot SITL, or sibling checkouts.

The fixture server is intentionally narrow. It supplies deterministic states
needed by UI tests and records requests so tests can verify that a user action
crossed the real client transport. It is not a substitute for `axio-server`
and must not grow into a second implementation of server behavior.

Cross-repo scenarios belong in the external system e2e harness. That harness
can use the stable accessible labels and `data-testid` values established
here, but it owns process orchestration and real protocol validation.

## Setup and tests

Install the test runner and agent CLI browser revisions once:

```sh
npm run e2e:install
```

Run the standalone suite:

```sh
npm run test:e2e
```

Failures retain a trace and screenshot under `e2e/artifacts/`. Open the HTML
report with `npm run e2e:report`.

## Agent exploration

Start the deterministic UI and fixture server:

```sh
npm run e2e:serve
```

In another terminal, open an isolated agent browser:

```sh
npm run e2e:agent -- open http://localhost:18080
npm run e2e:agent -- snapshot
```

The local `.playwright/cli.config.json` restricts requests to the standalone
application and fixture origins. Useful commands include `find`, `click`,
`screenshot`, `console`, `requests`, and `tracing-start` / `tracing-stop`.

## Test SDK

`support/control-app.ts` is the small reusable UI driver. Add helpers when a
workflow is used by more than one test; keep one-off assertions in the test
that owns them. Prefer accessible roles and names. Use `data-testid` only for
dynamic rows, canvases, or controls whose accessible name is not stable.
