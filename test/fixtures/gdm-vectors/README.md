# `.gdm` golden vectors (vendored)

Copied byte for byte from AxioStack `contracts/gdm-vectors/` at commit
`62c1601` (branch `docs/gdm-format-spec`, AxioStack PR #84), which also holds
the normative spec `contracts/gdm-format.md`. Only each vector's `show.gdm`
and `expected.json` are copied: Control reads `.gdm` containers, and Axio
Server validates the `.gdmb` payloads against the full vector set.

- `flat-single/` is the v1 conformance vector: Control loads it.
- `provisional/` holds containers with the provisional MANEUVER, RTH and
  envelope layouts (spec §4.11). A v1 reader refuses them (`G_PROVISIONAL`),
  and so does Control.

Do not edit these files. When the spec changes, regenerate the vectors in
AxioStack and copy them again.
