---
name: verify
description: How to see a Control change working end-to-end, with a real server and drones behind the GUI.
---

# Verifying a Control change

Use the `axio-e2e` harness in AxioStack (`repos/sw/axio-e2e`); its README is
the manual. In short, from the AxioStack root:

```sh
eval "$(tooling/stack env)"
CONTROL_REPO=$PWD/<your control worktree> repos/sw/axio-e2e/bin/axio-e2e.mjs up --profile virtual --drones 6
repos/sw/axio-e2e/bin/axio-e2e.mjs status    # what the app thinks
repos/sw/axio-e2e/bin/axio-e2e.mjs shot      # screenshot path
repos/sw/axio-e2e/bin/axio-e2e.mjs down
```

- Pick the profile by what the change touches: `mock` for GUI logic,
  `virtual` for show upload and the map, `sim` (firmware + SITL) for anything
  RTLS or flight. Only `sim` is evidence about the production stack.
- Assert on state and numbers, not pixels: read Redux through the bridge's
  `getState`, map features through `mapProbe()`, and locate elements by the
  test ids in `src/e2e/README.md`. Add a test id there when you need a new
  hook.
- The first webpack compile takes one to two minutes; the session outlives the
  command, so later commands reconnect to the same browser.

## Gotchas

- `socket.io` connection-refused errors in the console only mean no server is
  listening yet.
- Jest is ESM-sensitive: a new dependency imported by a tested module may need
  adding to `transformIgnorePatterns` in `jest.config.ts`.
