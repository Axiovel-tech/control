# `.gdm` golden vectors (vendored)

Copied byte for byte from AxioStack `contracts/gdm-vectors/` at commit
`81a81ff` (branch `docs/gdm-format-spec`, AxioStack PR #84), which also holds
the normative spec `contracts/gdm-format.md`. Only each vector's `show.gdm`
and `expected.json` are copied: Control reads `.gdm` containers, and Axio
Server validates the `.gdmb` payloads against the full vector set.

Do not edit these files. When the spec changes, regenerate the vectors in
AxioStack and copy them again.
