/**
 * @file Which device species (tag or anchor) an RTLS firmware image and a
 * device are. The role is image-pinned: a tag image on an anchor, or the
 * reverse, never rejoins WiFi and MCUboot cannot revert it, so an OTA always
 * declares the image's species and the server checks the device against it.
 */

import { type RtlsImageSpecies } from './messages';
import { classifyRole, isAnchorRole, RtlsRole } from './stats-utils';

/**
 * Infers the species from the image path: the build directories and file
 * names say `anchor` or `tag` (`build/axio_anchor/anchor/...`,
 * `build/axiolight-tag/tag/...`, `anchor.signed.bin`). `undefined` when the
 * path names neither or both, so the operator has to say.
 */
export function inferImageSpecies(path: string): RtlsImageSpecies | undefined {
  const tokens = new Set(path.toLowerCase().split(/[\\/._\s-]+/));
  const anchor = tokens.has('anchor');
  const tag = tokens.has('tag');
  if (anchor === tag) {
    return undefined;
  }
  return anchor ? 'anchor' : 'tag';
}

/** The species of a device from its reported role; `undefined` if unknown. */
export function getDeviceSpecies(
  role: string | undefined
): RtlsImageSpecies | undefined {
  const classified = classifyRole(role);
  if (isAnchorRole(classified)) {
    return 'anchor';
  }
  return classified === RtlsRole.TAG ? 'tag' : undefined;
}
