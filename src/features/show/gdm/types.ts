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
  /** The show's music: a non-safety entry of the container, as in `.skyc` */
  media?: {
    audio: { path: string; mediaType: string; filename?: string };
  };
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
  /** Engine: `false` for a report-only run, whose limits were not gated */
  kinematics_enforced?: boolean;
  checks?: Array<{ name: string; status: string }>;
  drones: Array<{
    id: string;
    status: GdmCertificationStatus;
    gdmb_sha256: string;
    gdmb_size: number;
    /** Engine: findings demoted to the report in a report-only run */
    demoted_findings?: number;
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

/**
 * Why a loaded `.gdm` is not certified for upload, in the order Control checks:
 *
 * - `certifier`: `certifier.name` is not an allow-listed certifier (the
 *   status in `certification.json` is not authenticated, so only certificates
 *   from the trajectory engine count; this also refuses the golden vectors);
 * - `status`: the show's status is not `pass`;
 * - `kinematicsNotEnforced`: a report-only run, whose limits were not gated;
 * - `checkNotPassed`: a check reads `fail` or `demoted`;
 * - `demotedFindings`: a drone has findings demoted to the report;
 * - `drone`: a drone's status is not `pass`, or its `.gdmb` SHA-256 or size
 *   differs from the certified one.
 */
export type GdmCertificationProblem =
  | 'certifier'
  | 'status'
  | 'kinematicsNotEnforced'
  | 'checkNotPassed'
  | 'demotedFindings'
  | 'drone';

/** A `.gdm` container that passed Control's checks. */
export type GdmContainer = {
  manifest: GdmManifest;
  show: GdmShowJson;
  certification: GdmCertificationJson;
  /** Why the show may not be uploaded; `undefined` if every drone may */
  certificationProblem?: GdmCertificationProblem;
  showHash: string;
  drones: GdmDrone[];
  /** The show's music, if the container carries one */
  audio?: { data: Uint8Array; mediaType: string; filename?: string };
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
    /** Why the show may not be uploaded; `undefined` if every drone may */
    problem?: GdmCertificationProblem;
  };
  /** Per slot: drone ID, base64 `.gdmb` and whether it is certified */
  drones: Array<{ id: string; gdmb: string; certified: boolean }>;
  /** The `.gdm`'s own geofence (`show.json`), in show coordinates */
  geofence?: GdmShowJson['geofence'];
};
