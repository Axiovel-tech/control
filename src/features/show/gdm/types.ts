/**
 * @file Types of the `.gdm` show container (AxioStack
 * `contracts/gdm-format.md`, version 1). Only the fields that Control reads
 * are typed; section numbers refer to the spec.
 */

/** `manifest.json` (§3.2) */
export type GdmManifest = {
  format: 'gdm';
  version: 1;
  generator: { name: string; version: string };
  show_hash: string;
  entries: Array<{ path: string; size: number; sha256: string }>;
};

/** `show.json` (§3.4) */
export type GdmShowJson = {
  version: 1;
  meta: Record<string, unknown> & { title?: string; id?: string };
  frame: 'nwu';
  environment: 'indoor' | 'outdoor';
  duration_us: number;
  limits: Record<string, number>;
  geofence?: {
    polygon: Array<[number, number]>;
    floor_m: number;
    ceiling_m: number;
  };
  required_capabilities: string[];
  rth?: { times_us: number[] };
  markers: Array<{ name: string; t_us: number }>;
  drones: Array<{ id: string; name?: string }>;
};

export type GdmVector3 = [number, number, number];

/** A FLAT segment (§3.6) */
export type GdmFlatSegment = {
  regime: 'flat';
  duration_us: number;
  sigma: 1 | -1;
  x: number[];
  y: number[];
  z: number[];
  yaw: number[];
  envelope?: { pos_m: number };
};

/** A MANEUVER segment (§3.6) */
export type GdmManeuverSegment = {
  regime: 'maneuver';
  duration_us: number;
  knot_us: number;
  p_hat: { x: number[]; y: number[]; z: number[] };
  yaw_exit: number;
};

export type GdmSegment = GdmFlatSegment | GdmManeuverSegment;

/** `drones/<id>.json` (§3.5) */
export type GdmDroneJson = {
  version: 1;
  id: string;
  home: GdmVector3;
  land_at?: GdmVector3;
  takeoff_us: number;
  landing_us: number;
  start: { p: GdmVector3; yaw: number };
  capabilities: string[];
  segments: GdmSegment[];
  lights?: { version: 1; data: string };
};

export type GdmCertificationStatus = 'pass' | 'fail';

/** `certification.json` (§3.7) */
export type GdmCertificationJson = {
  version: 1;
  show_hash: string;
  status: GdmCertificationStatus;
  evaluated: 'gdmb';
  certifier?: { name: string; version: string };
  drones: Array<{
    id: string;
    status: GdmCertificationStatus;
    gdmb_sha256: string;
    gdmb_size: number;
  }>;
};

/** One drone of a loaded `.gdm`, in slot order. */
export type GdmDrone = {
  id: string;
  name?: string;
  json: GdmDroneJson;
  /** The certified `.gdmb` bytes, exactly as stored in the container */
  gdmb: Uint8Array;
  /** Whether certification passed this drone and covers these exact bytes */
  certified: boolean;
};

/** A `.gdm` container that passed Control's checks. */
export type GdmContainer = {
  manifest: GdmManifest;
  show: GdmShowJson;
  certification: GdmCertificationJson;
  showHash: string;
  drones: GdmDrone[];
};

/**
 * What the Redux store keeps about a loaded `.gdm` show, next to the
 * `.skyc`-shaped preview specification in `show.data`.
 */
export type GdmShowInfo = {
  showHash: string;
  generator: { name: string; version: string };
  certification: {
    status: GdmCertificationStatus;
    certifier?: { name: string; version: string };
  };
  /** Per slot: drone ID, base64 `.gdmb` and whether it is certified */
  drones: Array<{ id: string; gdmb: string; certified: boolean }>;
  /** The `.gdm`'s own geofence (`show.json`), in show coordinates */
  geofence?: GdmShowJson['geofence'];
};
