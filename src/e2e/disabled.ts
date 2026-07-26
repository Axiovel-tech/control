/**
 * Stand-in for the E2E bridge in builds that do not enable it.
 *
 * `webpack/base.config.js` aliases `~/e2e` to this module unless `AXIO_E2E=1`,
 * so a normal build never resolves the real entry point at all. That matters
 * for two reasons a runtime guard cannot deliver:
 *
 * - No bridge code is emitted anywhere, not even into an unreferenced async
 *   chunk. "Shipped bundles carry no test surface" becomes a property of the
 *   module graph rather than of the minifier.
 * - The real entry statically imports the store and the message hub. Chunk
 *   assignment happens before dead-code elimination, so importing it from the
 *   app entry pulled that whole graph out of the lazily-loaded workbench chunk
 *   and into the initial bundle — measured at +254% on `app.bundle.js`, which
 *   defeats the code split the splash screen exists for.
 */

/** Does nothing. See the module comment. */
export const maybeInstallE2EBridge = (): void => {
  /* the bridge is not part of this build */
};
