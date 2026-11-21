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

/** Where the species an OTA declares comes from. */
export type ImageSpeciesSource = 'receipt' | 'operator' | 'path' | 'none';

/**
 * The species an OTA declares: the one the image's build receipt names (as
 * the server reports it; `locked`, the operator cannot flip it), else the
 * operator's choice, else the one the image path suggests as a default, else
 * none (''). Without a receipt the server takes the declared species.
 */
export function resolveImageSpecies(
  path: string,
  chosen: RtlsImageSpecies | '',
  receipt?: RtlsImageSpecies
): {
  species: RtlsImageSpecies | '';
  locked: boolean;
  source: ImageSpeciesSource;
} {
  if (receipt !== undefined) {
    return { species: receipt, locked: true, source: 'receipt' };
  }
  if (chosen !== '') {
    return { species: chosen, locked: false, source: 'operator' };
  }
  const inferred = inferImageSpecies(path);
  return inferred === undefined
    ? { species: '', locked: false, source: 'none' }
    : { species: inferred, locked: false, source: 'path' };
}

/** The server's answer about one image path. */
export type ImageInspection = {
  image: string;
  /** The species its build receipt names (absent: no receipt). */
  species?: RtlsImageSpecies;
  /** Why the server refuses the image (missing file, bad or stale receipt). */
  error?: string;
};

/**
 * Whether an OTA may start: an image the server inspected successfully, a
 * declared species, and one that matches the device.
 */
export const canStartOta = ({
  image,
  inspection,
  mismatch,
  species,
}: {
  image: string;
  inspection: ImageInspection | undefined;
  mismatch: boolean;
  species: RtlsImageSpecies | '';
}): boolean =>
  image.length > 0 &&
  inspection !== undefined &&
  inspection.error === undefined &&
  species !== '' &&
  !mismatch;
