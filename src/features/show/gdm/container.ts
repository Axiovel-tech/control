/**
 * @file Reader for `.gdm` show containers (AxioStack `contracts/gdm-format.md`,
 * version 1; section numbers refer to it).
 *
 * Control checks what it relies on before the operator assigns slots: the
 * container layout, every manifest SHA-256, the show hash, and that
 * certification covers the exact `.gdmb` bytes it will upload. The `.gdmb`
 * payloads themselves are validated rule by rule by Axio Server before they
 * reach a drone (§7.1).
 */

import JSZip from 'jszip';

import type {
  GdmCertificationJson,
  GdmCertificationProblem,
  GdmContainer,
  GdmDrone,
  GdmDroneJson,
  GdmManifest,
  GdmShowJson,
} from './types';

/**
 * Error thrown when a `.gdm` container fails a check. `code` is the stable
 * identifier of spec §7.2 (`G_ZIP`, `G_MANIFEST`, …).
 */
export class GdmLoadError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'GdmLoadError';
    this.code = code;
  }
}

/**
 * The newest `.gdm` version Control implements. Newer readers accept older
 * versions (spec §1.8): every `version` from 1 up to this one is read.
 */
const GDM_VERSION = 1;

const isSupportedVersion = (version: unknown): boolean =>
  Number.isInteger(version) &&
  (version as number) >= 1 &&
  (version as number) <= GDM_VERSION;

/**
 * Certifiers whose `certification.json` Control accepts. The status in the
 * file is not authenticated (signing comes later), so a certificate written
 * by anything else, such as the golden vectors' `gdm_ref.py`, never counts.
 */
export const ALLOWED_CERTIFIERS: ReadonlySet<string> = new Set([
  'axio-trajectory-engine',
]);

/**
 * Media types of the show's music and the file extension of its entry
 * (`media/audio.<ext>`).
 */
const AUDIO_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'audio/wav': 'wav',
};

/**
 * The normal-executor tilt bound: REVB `ATC_ANGLE_MAX` 30° minus a 5° margin
 * for position correction. Tilt above it needs the high-tilt executor, which
 * does not exist yet, so no v1 show may declare it.
 */
const MAX_TILT_RAD = (25 * Math.PI) / 180;

const DRONE_ID_PATTERN = /^[A-Za-z\d][\w-]{0,31}$/;
const HEX_DIGEST_PATTERN = /^[\da-f]{64}$/;
const MAX_DRONES = 5000;
const GDMB_MAGIC = [0x47, 0x44, 0x4d, 0x42]; // "GDMB"
const GDMB_SHOW_HASH_OFFSET = 12;

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

// The copy gives SubtleCrypto the plain ArrayBuffer-backed view it requires
const sha256 = async (data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(data))
  );

/** Compares two ASCII strings in ascending byte order. */
const compareBytewise = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseJson = (bytes: Uint8Array, path: string): unknown => {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.startsWith('﻿')) {
      throw new Error('starts with a byte order mark');
    }

    return JSON.parse(text);
  } catch (error) {
    throw new GdmLoadError(
      'G_JSON',
      `${path} is not valid JSON: ${(error as Error).message}`
    );
  }
};

/**
 * Computes the show hash of §3.3 from the container entries.
 */
export async function computeShowHash(
  entries: Map<string, Uint8Array>
): Promise<string> {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const paths = [...entries.keys()]
    .filter(
      (path) =>
        path === 'show.json' ||
        (path.startsWith('drones/') && path.endsWith('.json'))
    )
    .sort(compareBytewise);

  for (const path of paths) {
    parts.push(
      encoder.encode(path),
      new Uint8Array([0]),
      // `paths` is built from the keys of `entries`, so the entry exists
      await sha256(entries.get(path)!)
    );
  }

  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    buffer.set(part, offset);
    offset += part.length;
  }

  return toHex(await sha256(buffer));
}

async function readZipEntries(
  data: Uint8Array | ArrayBuffer
): Promise<Map<string, Uint8Array>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (error) {
    throw new GdmLoadError(
      'G_ZIP',
      `not a readable ZIP archive: ${(error as Error).message}`
    );
  }

  const entries = new Map<string, Uint8Array>();
  for (const file of Object.values(zip.files)) {
    const { name } = file;
    if (
      file.dir ||
      name.endsWith('/') ||
      name.startsWith('/') ||
      name.includes('\\') ||
      name.split('/').includes('..')
    ) {
      throw new GdmLoadError('G_ZIP', `forbidden entry name: ${name}`);
    }

    entries.set(name, await file.async('uint8array'));
  }

  return entries;
}

function checkManifest(value: unknown): GdmManifest {
  if (!isObject(value)) {
    throw new GdmLoadError('G_MANIFEST', 'manifest.json is not an object');
  }

  if (value.format !== 'gdm' || !isSupportedVersion(value.version)) {
    throw new GdmLoadError(
      'G_VERSION',
      `manifest.json is not a .gdm manifest of version 1 to ${GDM_VERSION}`
    );
  }

  if (
    typeof value.show_hash !== 'string' ||
    !HEX_DIGEST_PATTERN.test(value.show_hash) ||
    !Array.isArray(value.entries) ||
    !isObject(value.generator)
  ) {
    throw new GdmLoadError('G_MANIFEST', 'manifest.json is malformed');
  }

  const paths: string[] = [];
  for (const entry of value.entries as unknown[]) {
    if (
      !isObject(entry) ||
      typeof entry.path !== 'string' ||
      !Number.isInteger(entry.size) ||
      typeof entry.sha256 !== 'string' ||
      !HEX_DIGEST_PATTERN.test(entry.sha256)
    ) {
      throw new GdmLoadError('G_MANIFEST', 'malformed manifest entry');
    }

    paths.push(entry.path);
  }

  for (let i = 1; i < paths.length; i++) {
    if (compareBytewise(paths[i - 1], paths[i]) >= 0) {
      throw new GdmLoadError(
        'G_MANIFEST',
        'manifest entries are not sorted and unique'
      );
    }
  }

  return value as GdmManifest;
}

function checkShow(value: unknown): GdmShowJson {
  if (!isObject(value) || !isSupportedVersion(value.version)) {
    throw new GdmLoadError(
      'G_VERSION',
      `show.json is not of version 1 to ${GDM_VERSION}`
    );
  }

  if (value.frame !== 'nwu') {
    throw new GdmLoadError('G_VALUE', 'show.json frame must be "nwu"');
  }

  if (value.environment !== 'indoor' && value.environment !== 'outdoor') {
    throw new GdmLoadError('G_VALUE', 'show.json environment is invalid');
  }

  const { drones } = value;
  if (
    !Array.isArray(drones) ||
    drones.length === 0 ||
    drones.length > MAX_DRONES
  ) {
    throw new GdmLoadError(
      'G_SCHEMA',
      `show.json must list 1 to ${MAX_DRONES} drones`
    );
  }

  const seen = new Set<string>();
  for (const drone of drones as unknown[]) {
    if (
      !isObject(drone) ||
      typeof drone.id !== 'string' ||
      !DRONE_ID_PATTERN.test(drone.id)
    ) {
      throw new GdmLoadError('G_VALUE', 'show.json has an invalid drone ID');
    }

    const key = drone.id.toLowerCase();
    if (seen.has(key)) {
      throw new GdmLoadError(
        'G_VALUE',
        `drone ID ${drone.id} is not unique (case-insensitive)`
      );
    }

    seen.add(key);
  }

  if ('rth' in value) {
    throw new GdmLoadError(
      'G_PROVISIONAL',
      'show.json has an RTH plan, a provisional layout that v1 does not load'
    );
  }

  const tilt = isObject(value.limits) ? value.limits.max_tilt_rad : undefined;
  if (typeof tilt === 'number' && tilt > MAX_TILT_RAD + 1e-12) {
    throw new GdmLoadError(
      'G_VALUE',
      'show.json limits.max_tilt_rad is above the 25° normal-executor bound'
    );
  }

  if ('media' in value) {
    checkMedia(value.media);
  }

  return value as GdmShowJson;
}

/** Checks `show.json` `media`: only `audio`, with a known media type. */
function checkMedia(media: unknown): void {
  const audio = isObject(media) ? media.audio : undefined;
  if (
    !isObject(media) ||
    Object.keys(media).some((key) => key !== 'audio') ||
    !isObject(audio) ||
    Object.keys(audio).some(
      (key) => key !== 'path' && key !== 'mediaType' && key !== 'filename'
    )
  ) {
    throw new GdmLoadError('G_SCHEMA', 'show.json media is malformed');
  }

  const extension =
    typeof audio.mediaType === 'string'
      ? AUDIO_EXTENSIONS[audio.mediaType]
      : undefined;
  if (!extension || audio.path !== `media/audio.${extension}`) {
    throw new GdmLoadError(
      'G_VALUE',
      'show.json media.audio needs a known media type and the matching path'
    );
  }

  if ('filename' in audio && typeof audio.filename !== 'string') {
    throw new GdmLoadError('G_TYPE', 'show.json media.audio.filename');
  }
}

/**
 * Refuses the provisional JSON of spec §4.11 in a drone file: MANEUVER
 * segments, FLAT envelopes and RTH plans. Their layouts may still change, and
 * a v1 reader must not load them.
 */
function checkNotProvisional(drone: Record<string, unknown>, id: string): void {
  const where = `drones/${id}.json`;
  if ('rth' in drone) {
    throw new GdmLoadError(
      'G_PROVISIONAL',
      `${where} has an RTH plan, a provisional layout that v1 does not load`
    );
  }

  for (const segment of drone.segments as unknown[]) {
    if (isObject(segment) && segment.regime === 'maneuver') {
      throw new GdmLoadError(
        'G_PROVISIONAL',
        `${where} has a MANEUVER segment, a provisional layout that v1 does not load`
      );
    }

    if (isObject(segment) && 'envelope' in segment) {
      throw new GdmLoadError(
        'G_PROVISIONAL',
        `${where} has a FLAT envelope, a provisional layout that v1 does not load`
      );
    }
  }
}

function checkCertification(
  value: unknown,
  showHash: string
): GdmCertificationJson {
  if (
    !isObject(value) ||
    !isSupportedVersion(value.version) ||
    (value.status !== 'pass' && value.status !== 'fail') ||
    value.evaluated !== 'gdmb' ||
    !Array.isArray(value.drones)
  ) {
    throw new GdmLoadError('G_SCHEMA', 'certification.json is malformed');
  }

  if (value.show_hash !== showHash) {
    throw new GdmLoadError(
      'G_CERT',
      'certification.json certifies a different show'
    );
  }

  const ids = new Set<string>();
  for (const drone of value.drones as unknown[]) {
    const id = isObject(drone) ? drone.id : undefined;
    if (typeof id !== 'string') {
      throw new GdmLoadError('G_SCHEMA', 'certification.json is malformed');
    }

    // Two entries for one drone would let either one win; refuse both
    if (ids.has(id)) {
      throw new GdmLoadError(
        'G_CERT',
        `certification.json lists drone ${id} more than once`
      );
    }

    ids.add(id);
  }

  return value as GdmCertificationJson;
}

/**
 * Returns why the certificate does not certify the show as a whole, or
 * `undefined` if it does. Per-drone bindings are checked separately.
 */
function getShowCertificationProblem(
  certification: GdmCertificationJson
): GdmCertificationProblem | undefined {
  if (!ALLOWED_CERTIFIERS.has(certification.certifier?.name ?? '')) {
    return 'certifier';
  }

  if (certification.status !== 'pass') {
    return 'status';
  }

  if (certification.kinematics_enforced !== true) {
    return 'kinematicsNotEnforced';
  }

  // `checks` is informative and optional, but a check that did not pass
  // means the show was not certified as written
  if (
    certification.checks !== undefined &&
    (!Array.isArray(certification.checks) ||
      certification.checks.some(
        (check) => !isObject(check) || check.status !== 'pass'
      ))
  ) {
    return 'checkNotPassed';
  }

  if (certification.drones.some((drone) => drone.demoted_findings)) {
    return 'demotedFindings';
  }

  return undefined;
}

function gdmbCarriesShowHash(gdmb: Uint8Array, showHash: string): boolean {
  return (
    gdmb.length >= GDMB_SHOW_HASH_OFFSET + 32 &&
    GDMB_MAGIC.every((byte, index) => gdmb[index] === byte) &&
    toHex(gdmb.subarray(GDMB_SHOW_HASH_OFFSET, GDMB_SHOW_HASH_OFFSET + 32)) ===
      showHash
  );
}

/**
 * Reads a `.gdm` container and checks it.
 *
 * Structural or integrity faults (layout, manifest, hashes, a `.gdmb` that
 * does not belong to the show) reject the whole container. A container
 * whose certification failed is still returned, with `certification.status`
 * and the per-drone `certified` flags telling the caller not to upload it.
 */
export async function loadGdmContainer(
  data: Uint8Array | ArrayBuffer
): Promise<GdmContainer> {
  const entries = await readZipEntries(data);

  const manifestBytes = entries.get('manifest.json');
  if (!manifestBytes) {
    throw new GdmLoadError('G_MANIFEST', 'manifest.json is missing');
  }

  entries.delete('manifest.json');
  const manifest = checkManifest(parseJson(manifestBytes, 'manifest.json'));

  // Listed entries must be exactly the ZIP entries, with matching size and
  // SHA-256 (§3.2)
  if (manifest.entries.length !== entries.size) {
    throw new GdmLoadError(
      'G_MANIFEST',
      'manifest entries differ from the ZIP entries'
    );
  }

  for (const { path, size, sha256: expected } of manifest.entries) {
    const bytes = entries.get(path);
    if (!bytes) {
      throw new GdmLoadError('G_MANIFEST', `${path} is listed but missing`);
    }

    if (bytes.length !== size || toHex(await sha256(bytes)) !== expected) {
      throw new GdmLoadError(
        'G_MANIFEST',
        `${path} does not match its size or SHA-256`
      );
    }
  }

  const showHash = await computeShowHash(entries);
  if (showHash !== manifest.show_hash) {
    throw new GdmLoadError(
      'G_SHOW_HASH',
      'manifest show_hash does not match the show content'
    );
  }

  const showBytes = entries.get('show.json');
  if (!showBytes) {
    throw new GdmLoadError('G_MANIFEST', 'show.json is missing');
  }

  const show = checkShow(parseJson(showBytes, 'show.json'));

  // The entry set is exactly that of §3.1 for the drones in show.json
  const expected = new Set([
    'show.json',
    'certification.json',
    'provenance.json',
  ]);
  for (const { id } of show.drones) {
    expected.add(`drones/${id}.json`).add(`drones/${id}.gdmb`);
  }

  if (show.media) {
    expected.add(show.media.audio.path);
  }

  if (
    expected.size !== entries.size ||
    [...entries.keys()].some((path) => !expected.has(path))
  ) {
    throw new GdmLoadError(
      'G_MANIFEST',
      'the entries do not match the drones in show.json'
    );
  }

  const certification = checkCertification(
    // `expected` contains certification.json and equals the entry set
    parseJson(entries.get('certification.json')!, 'certification.json'),
    showHash
  );
  // Drone IDs are unique in certification.json (checked above)
  const certifiedById = new Map(certification.drones.map((d) => [d.id, d]));
  const showProblem = getShowCertificationProblem(certification);

  const drones: GdmDrone[] = [];
  for (const { id, name } of show.drones) {
    // Both entries exist: the entry set equals `expected`
    const json = parseJson(
      entries.get(`drones/${id}.json`)!,
      `drones/${id}.json`
    ) as GdmDroneJson;
    const gdmb = entries.get(`drones/${id}.gdmb`)!;

    if (!isObject(json) || json.id !== id || !Array.isArray(json.segments)) {
      throw new GdmLoadError('G_SCHEMA', `drones/${id}.json is malformed`);
    }

    if (!isSupportedVersion(json.version)) {
      throw new GdmLoadError(
        'G_VERSION',
        `drones/${id}.json is not of version 1 to ${GDM_VERSION}`
      );
    }

    checkNotProvisional(json, id);

    if (json.capabilities?.includes('high_tilt')) {
      throw new GdmLoadError(
        'G_VALUE',
        `drones/${id}.json: high_tilt is reserved until a high-tilt executor exists`
      );
    }

    if (!gdmbCarriesShowHash(gdmb, showHash)) {
      throw new GdmLoadError(
        'G_SHOW_HASH',
        `drones/${id}.gdmb does not carry the show hash`
      );
    }

    const entry = certifiedById.get(id);
    const certified =
      showProblem === undefined &&
      entry?.status === 'pass' &&
      entry.gdmb_size === gdmb.length &&
      entry.gdmb_sha256 === toHex(await sha256(gdmb));

    drones.push({ id, name, json, gdmb, certified });
  }

  const certificationProblem =
    showProblem ??
    (drones.some((drone) => !drone.certified) ? 'drone' : undefined);

  const audio = show.media
    ? {
        // The entry set equals `expected`, which holds the media path
        data: entries.get(show.media.audio.path)!,
        mediaType: show.media.audio.mediaType,
        ...(show.media.audio.filename === undefined
          ? {}
          : { filename: show.media.audio.filename }),
      }
    : undefined;

  return {
    manifest,
    show,
    certification,
    certificationProblem,
    showHash,
    drones,
    ...(audio ? { audio } : {}),
  };
}
