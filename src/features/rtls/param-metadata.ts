/**
 * @file Static, client-side metadata for the RTLS firmware parameters.
 *
 * The X-RTLS-PARAM-LIST payload carries only name, value, type and index;
 * descriptions, units, bounds and enum labels do not exist on the wire. This
 * module mirrors them from the firmware's RTLS_PARAM_DEFINE_* sites
 * (rtls-link-zephyr: lib/uwb/src/params.cpp, lib/net/src/wifi_params.cpp,
 * lib/uwb/src/backends/sim/*, lib/positioning/src/*, app/{tag,anchor}/src)
 * so the GUI can render human-readable hints. Purely advisory: unknown
 * parameters simply have no metadata and must render fine without it.
 */

export type RtlsParamMetadata = {
  /** One-line human description, mirrored from the firmware sources. */
  description: string;

  /** Display unit, e.g. 'm', 'ms', 'Hz', '%', 'deg·1e-7', 'ppm'. */
  unit?: string;

  /** Labels for enum-valued integer parameters, keyed by wire value. */
  enumLabels?: Record<number, string>;

  /** Lower bound enforced by the firmware registry, if numeric. */
  min?: number;

  /** Upper bound enforced by the firmware registry, if numeric. */
  max?: number;

  /** Firmware default, when it is a fixed literal in the definition. */
  defaultValue?: number | string;
};

const EXACT: Record<string, RtlsParamMetadata> = {
  /* --- UWB identity and session shape (lib/uwb/src/params.cpp) --- */
  UWB_MAC: {
    description: 'UWB short MAC address of this device',
    min: 0,
    max: 0xfffe,
  },
  UWB_CHANNEL: {
    description: 'UWB RF channel',
    min: 5,
    max: 9,
    defaultValue: 9,
  },
  UWB_SESSION_ID: {
    description: 'Ranging session identifier shared by the cell',
    min: 1,
    max: 0xfffffffe,
  },
  UWB_BLOCK_MS: {
    description: 'Ranging block duration',
    unit: 'ms',
    min: 10,
    max: 1000,
    defaultValue: 100,
  },
  UWB_SLOT_RSTU: {
    description: 'Ranging slot length',
    unit: 'RSTU',
    min: 1200,
    max: 12000,
    defaultValue: 1200,
  },
  UWB_SLOTS_RR: {
    description: 'Slots per ranging round',
    min: 3,
    max: 25,
    defaultValue: 4,
  },
  UWB_ROUNDS: {
    description: 'Ranging rounds per block',
    min: 1,
    max: 8,
    defaultValue: 1,
  },
  UWB_ROLE: {
    description:
      'Device role in the ranging cell; image-pinned (a tag image is ' +
      'always a tag, an anchor image allows initiator or responder)',
    enumLabels: {
      0: 'disabled',
      1: 'tag',
      2: 'anchor-initiator',
      3: 'anchor-responder',
    },
  },

  /* --- Anchor table and estimator tuning (lib/uwb/src/params.cpp) --- */
  UWB_AN_COUNT: {
    description: 'Number of configured anchors in the anchor table',
    min: 0,
    max: 8,
  },
  UWB_HALF_TOF: {
    description: 'Half time-of-flight correction of reported ranges',
    enumLabels: { 0: 'off', 1: 'on' },
    defaultValue: 1,
  },
  UWB_WIN_AGE: {
    description:
      'Sliding-window estimator: maximum measurement age kept in the window',
    unit: 'ms',
    min: 50,
    max: 500,
    defaultValue: 150,
  },
  UWB_WIN_DEPTH: {
    description:
      'Sliding-window estimator: time-separated measurement generations ' +
      'retained per responder',
    min: 1,
    max: 3,
    defaultValue: 2,
  },
  UWB_EMIT_HZ: {
    description:
      'Solve/emit rate toward the autopilot; 0 solves on every ranging epoch',
    unit: 'Hz',
    min: 0,
    max: 100,
    defaultValue: 50,
  },
  UWB_MAX_SPD: {
    description:
      'Maximum plausible tag speed; clamps velocity compensation and the ' +
      'MAP prior growth during fix gaps',
    unit: 'm/s',
    min: 0.5,
    max: 20,
    defaultValue: 5,
  },
  UWB_DOA_SIGMA: {
    description:
      'Nominal 1-sigma of a single ranging measurement; sets information ' +
      'weights and the covariance scale',
    unit: 'm',
    min: 0.02,
    max: 0.5,
    defaultValue: 0.1,
  },

  /* --- Wi-Fi (lib/net/src/wifi_params.cpp, modes in wifi.c) --- */
  WIFI_MODE: {
    description: 'Wi-Fi operating mode',
    enumLabels: { 0: 'off', 1: 'access point', 2: 'station' },
    min: 0,
    max: 2,
  },
  WIFI_AP_SSID: {
    description: 'SSID of the access point run by the device',
    defaultValue: 'rtls-link',
  },
  WIFI_AP_PSK: {
    description: "Passphrase of the device's access point",
  },
  WIFI_AP_CHAN: {
    description: "Wi-Fi channel of the device's access point",
    min: 1,
    max: 13,
    defaultValue: 1,
  },
  WIFI_STA_SSID: {
    description: 'SSID of the network to join in station mode',
  },
  WIFI_STA_PSK: {
    description: 'Passphrase of the network to join in station mode',
  },

  /* --- Site origin and frame (lib/positioning/src/params.cpp) --- */
  ORIGIN_LAT_E7: {
    description: 'Site origin latitude',
    unit: 'deg·1e-7',
    min: -900000000,
    max: 900000000,
  },
  ORIGIN_LON_E7: {
    description: 'Site origin longitude',
    unit: 'deg·1e-7',
    min: -1800000000,
    max: 1800000000,
  },
  ORIGIN_ALT_MM: {
    description: 'Site origin altitude',
    unit: 'mm',
    min: -1000000,
    max: 10000000,
  },
  POS_YAW_DEG: {
    description: 'Rotation of the local site frame about vertical',
    unit: 'deg',
    min: -180,
    max: 180,
  },
  POS_DBG_HZ: {
    description:
      'Position-estimate debug stream rate (NAMED_VALUE_FLOAT pn/pe/pd + ' +
      'psig on the management link); 0 = off',
    unit: 'Hz',
    min: 0,
    max: 50,
    defaultValue: 0,
  },

  /* --- MAVLink identity (app/{tag,anchor}/src/app_params.cpp) --- */
  MAV_SYS_ID: {
    description: 'MAVLink system id of the device',
    min: 1,
    max: 255,
  },
  MAV_COMP_ID: {
    description: 'MAVLink component id of the device',
    min: 1,
    max: 255,
  },
  FW_VERSION: {
    description: 'Running firmware image version (read-only by convention)',
  },

  /* --- Simulation: shared UWB medium (backends/sim/sim_common.cpp) --- */
  SIM_UWB_RATE_HZ: {
    description:
      'Emission rate of the simulated UWB producers; 50 Hz is the highest ' +
      'jitter-free rate on the shipping native_sim',
    unit: 'Hz',
    min: 1,
    max: 100,
    defaultValue: 50,
  },
  SIM_UWB_NOISE_M: {
    description: 'Gaussian noise (1-sigma) added to simulated ranges',
    unit: 'm',
    min: 0,
    max: 5,
    defaultValue: 0.05,
  },
  SIM_GEO_ERR_M: {
    description:
      'Survey error: true anchor positions offset from the configured ' +
      'table by this magnitude along fixed per-anchor directions',
    unit: 'm',
    min: 0,
    max: 1,
    defaultValue: 0,
  },

  /* --- Simulation: ranging fault injection (sim_ranging_backend.cpp) --- */
  SIM_UWB_DROP_PCT: {
    description:
      'Per-responder link loss probability per epoch (entry absent from ' +
      'the epoch, as on hardware)',
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  SIM_UWB_RND_PCT: {
    description: 'Probability that a whole ranging round (epoch) is lost',
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  SIM_UWB_SCHED: {
    description: 'Simulated schedule failure: total ranging silence while on',
    enumLabels: { 0: 'normal', 1: 'failed (silent)' },
    defaultValue: 0,
  },
  SIM_UWB_NLOS_AN: {
    description:
      'Index of the anchor subjected to a simulated (chip-flagged) NLOS ' +
      'bias; -1 = none',
    min: -1,
    max: 7,
    defaultValue: -1,
  },
  SIM_UWB_NLOS_M: {
    description: 'Range bias applied to the NLOS anchor',
    unit: 'm',
    min: 0,
    max: 10,
    defaultValue: 0.5,
  },
  SIM_UWB_NLOS_PCT: {
    description:
      'Probability per epoch that the NLOS anchor takes the bias; 100 = ' +
      'constant obstruction, lower = intermittent multipath',
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 100,
  },
  SIM_UWB_OUT_PCT: {
    description:
      'Per-link probability of a transient range spike per epoch; not ' +
      "chip-flagged, exercises the estimator's robust loss",
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  SIM_UWB_OUT_M: {
    description: 'Magnitude of the transient outlier range spike',
    unit: 'm',
    min: 0,
    max: 20,
    defaultValue: 1,
  },
  SIM_UWB_DSTWR: {
    description:
      'Emit DS-TWR fields (initiator FINAL + reply times) exactly as on ' +
      'SR250 hardware',
    enumLabels: { 0: 'off', 1: 'on' },
    defaultValue: 0,
  },
  SIM_UWB_NOFIN: {
    description:
      'Probability per epoch (with DS-TWR on) that the FINAL is lost, ' +
      'forcing the TX-stamp fallback construction',
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  SIM_UWB_TXERR_M: {
    description:
      'Response TX stamp error; models SR250 post-resync TX stamp drift ' +
      '(visible only via the fallback construction)',
    unit: 'm',
    min: -5,
    max: 5,
    defaultValue: 0,
  },
  SIM_CLK_PPM: {
    description:
      'Tag clock rate offset vs the anchor cluster; exercises clock ' +
      'correction end to end',
    unit: 'ppm',
    min: -100,
    max: 100,
    defaultValue: 0,
  },

  /* --- Simulation: position source (lib/positioning/src/backends/sim) --- */
  SIM_SRC: {
    description: 'Tag simulation producer, switchable live',
    enumLabels: {
      0: 'truth position',
      1: 'simulated ranging',
      2: 'live UWB ether',
    },
    defaultValue: 0,
  },
  SIM_POS_NOISE_M: {
    description:
      'Gaussian noise (1-sigma) added to the simulated position estimate',
    unit: 'm',
    min: 0,
    max: 5,
    defaultValue: 0.05,
  },
  SIM_POS_RATE_HZ: {
    description: 'Simulated position source emission rate',
    unit: 'Hz',
    min: 1,
    max: 50,
    defaultValue: 30,
  },
  SIM_DROP_PCT: {
    description: 'Probability that a simulated position sample is dropped',
    unit: '%',
    min: 0,
    max: 100,
    defaultValue: 0,
  },
  SIM_LAT_MS: {
    description: 'Artificial latency added to simulated position samples',
    unit: 'ms',
    min: 0,
    max: 1000,
    defaultValue: 0,
  },
};

/**
 * Metadata templates for the anchor table slots UWB_AN{0..7}_{X,Y,Z,MAC,BIAS_M}
 * (40 parameters generated by a firmware macro; 5 templates instead of 40
 * hand-written entries). Positions are in the local site NED frame.
 */
const ANCHOR_FIELD_TEMPLATES: Record<
  string,
  (slot: string) => RtlsParamMetadata
> = {
  X: (slot) => ({
    description: `Anchor ${slot} north position in the site frame`,
    unit: 'm',
    min: -1000,
    max: 1000,
  }),
  Y: (slot) => ({
    description: `Anchor ${slot} east position in the site frame`,
    unit: 'm',
    min: -1000,
    max: 1000,
  }),
  Z: (slot) => ({
    description: `Anchor ${slot} down position in the site frame`,
    unit: 'm',
    min: -1000,
    max: 1000,
  }),
  MAC: (slot) => ({
    description: `UWB short MAC address of anchor ${slot}`,
    min: 0,
    max: 0xfffe,
  }),
  BIAS_M: (slot) => ({
    description: `Per-anchor range bias correction for anchor ${slot}`,
    unit: 'm',
    min: -5,
    max: 5,
  }),
};

const ANCHOR_SLOT_REGEX = /^UWB_AN([0-7])_(X|Y|Z|MAC|BIAS_M)$/;

/**
 * Cache of template-resolved metadata so repeated lookups (the filter and
 * every row render hit this per keystroke) are plain map reads returning
 * stable object identities.
 */
const resolvedCache = new Map<string, RtlsParamMetadata>();

/**
 * Returns the static metadata for the given RTLS parameter name, or
 * `undefined` when the parameter is unknown to this build of the GUI.
 * Callers must treat the metadata as optional decoration only.
 */
export function getRtlsParamMetadata(
  name: string
): RtlsParamMetadata | undefined {
  const exact = EXACT[name];
  if (exact) {
    return exact;
  }

  const cached = resolvedCache.get(name);
  if (cached) {
    return cached;
  }

  const match = ANCHOR_SLOT_REGEX.exec(name);
  if (match) {
    const metadata = ANCHOR_FIELD_TEMPLATES[match[2]](match[1]);
    resolvedCache.set(name, metadata);
    return metadata;
  }

  return undefined;
}
