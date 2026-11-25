/**
 * @file Pre-show fleet health: each drone's IMU temperature, the anchors its
 * tag positions on and its tag's UWB and WiFi link quality, graded into
 * green / yellow / red zones.
 *
 * The zones only inform the operator; nothing is gated on them. The evidence
 * behind every threshold is in AxioStack `contracts/rtls-fleet-health.md`;
 * change it there together with the constant.
 */

import { Status, statusToPriority } from '~/components/semantics';

import { type I18nText } from './i18n-text';
import { countAnchorsInMask, isTagPositioned } from './stats-utils';
import { type RtlsDeviceStats } from './types';

/** Where the yellow and the red zone of a metric start. */
type Zones = { yellow: number; red: number };

/**
 * Hottest IMU, °C. Over 97 fleet flights the takeoff accel offset of the top
 * IMU grew by 0.017 m/s² per °C of its temperature before spin-up; the two
 * hot takeoff stalls on record started at 52 and 57 °C, so yellow spans the
 * temperatures they started from.
 */
export const IMU_TEMPERATURE_ZONES_C: Zones = { yellow: 52, red: 60 };

/**
 * The weakest anchor's UWB RSSI, dBm; lower is worse. SR250 sensitivity is
 * −96.5 dBm; a bench tag received every row at −90 dBm and 2 % at −94 dBm.
 */
export const UWB_RSSI_ZONES_DBM: Zones = { yellow: -85, red: -90 };

/**
 * Anchors the chip flags NLOS on most rows. Each is weighted ×0.25 in the
 * solve, about 4 % of precision, so even one stays visible until it is fixed;
 * three flagged anchors moved simulated fixes by 0.36 m.
 */
export const NLOS_ANCHOR_ZONES: Zones = { yellow: 1, red: 3 };

/**
 * A tag's live initiator ranges against the distances between the advertised
 * positions, metres: green under 5 cm, red above 10 cm, where the server's
 * Verify rule `anchors` warns. The stat includes the survey fit's own
 * residual on each pair, so it starts above zero with nothing moved.
 */
export const SURVEY_DRIFT_ZONES_M: Zones = { yellow: 0.05, red: 0.1 };

/**
 * Anchors the solver is outvoting. The other seven absorb one wrong range; at
 * two the solver can outvote the wrong anchor.
 */
export const OUTVOTED_ANCHOR_ZONES: Zones = { yellow: 1, red: 2 };

/**
 * Solver residual RMS, metres. 0.03 m on a clean simulated stream; red from
 * the solver's 0.10 m noise model, past which the covariance the autopilot
 * receives is optimistic.
 */
export const RESIDUAL_ZONES_M: Zones = { yellow: 0.05, red: 0.1 };

/**
 * The tag's WiFi association, dBm; lower is worse. The usual guidance for
 * real-time traffic is −67 dBm or better.
 */
export const WIFI_RSSI_ZONES_DBM: Zones = { yellow: -67, red: -75 };

const ZONE_STATUSES = [Status.SUCCESS, Status.WARNING, Status.ERROR] as const;

/** Zone of a metric where higher is worse. */
const zoneAbove = (value: number, zones: Zones): Status =>
  ZONE_STATUSES[(value >= zones.yellow ? 1 : 0) + (value >= zones.red ? 1 : 0)];

/** Zone of a metric where lower is worse. */
const zoneBelow = (value: number, zones: Zones): Status =>
  ZONE_STATUSES[(value < zones.yellow ? 1 : 0) + (value < zones.red ? 1 : 0)];

export type FleetHealthMetricId =
  | 'imuTemperature'
  | 'uwbRssi'
  | 'anchorSet'
  | 'surveyDrift'
  | 'nlosAnchors'
  | 'outvotedAnchors'
  | 'residual'
  | 'wifi';

export type FleetHealthMetric = {
  /** Also the suffix of its label key, `rtlsFleetHealth.label.<id>`. */
  id: FleetHealthMetricId;
  /** `Status.OFF` while the metric is unknown. */
  status: Status;
  text: I18nText;
};

const UNKNOWN: Omit<FleetHealthMetric, 'id'> = {
  status: Status.OFF,
  text: { key: 'rtlsFleetHealth.value.unknown' },
};

/**
 * Anchor names by row of the tag's own table (`tableRowNames`), the bit
 * index of its anchor masks. A row without a name is shown as `row <i>`.
 */
export type AnchorNames = ReadonlyArray<string | undefined>;

/** Anchor names of a mask, lowest row first, for interpolation. */
const describeMaskAnchors = (mask: number, names?: AnchorNames): string =>
  Array.from({ length: 8 }, (_, index) => index)
    .filter((index) => (mask & (1 << index)) !== 0)
    .map((index) => names?.[index] ?? `row ${index}`)
    .join(', ');

const describeImuTemperature = (
  temperatures: Array<number | null> | undefined
): Omit<FleetHealthMetric, 'id'> => {
  const all = temperatures ?? [];
  const known = all.filter((value): value is number => value !== null);
  if (known.length === 0) {
    return UNKNOWN;
  }

  return {
    status: zoneAbove(Math.max(...known), IMU_TEMPERATURE_ZONES_C),
    text: {
      key: 'rtlsFleetHealth.value.imuTemperature',
      values: {
        temperatures: all
          .map((value) => (value === null ? '—' : value.toFixed(1)))
          .join(' / '),
      },
    },
  };
};

/**
 * One of the tag's anchor masks, graded by how many anchors it names. The NLOS
 * and the outvoted mask get a line each, so a permanently flagged anchor
 * cannot hide a new one or a real outvote.
 */
const describeAnchorMask = (
  mask: number | undefined,
  zones: Zones,
  names?: AnchorNames
): Omit<FleetHealthMetric, 'id'> => {
  if (mask === undefined) {
    return UNKNOWN;
  }

  return {
    status: zoneAbove(countAnchorsInMask(mask), zones),
    text:
      mask === 0
        ? { key: 'rtlsFleetHealth.value.anchorsClear' }
        : {
            key: 'rtlsFleetHealth.value.anchors',
            values: { anchors: describeMaskAnchors(mask, names) },
          },
  };
};

/**
 * The anchors the tag positions on: green while it leaves none out, yellow
 * while it leaves one or more out, red while it follows no survey. Unknown
 * while its firmware reports no table.
 */
const describeAnchorSet = (
  stats: RtlsDeviceStats
): Omit<FleetHealthMetric, 'id'> => {
  const positioned = isTagPositioned(stats);
  if (positioned === undefined) {
    return UNKNOWN;
  }
  if (!positioned) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsFleetHealth.value.noSurvey' },
    };
  }
  const excluded = stats.anchorsExcluded ?? 0;
  return excluded > 0
    ? {
        status: Status.WARNING,
        text: {
          key: 'rtlsFleetHealth.value.anchorsExcluded',
          values: { count: excluded },
        },
      }
    : {
        status: Status.SUCCESS,
        text: { key: 'rtlsFleetHealth.value.anchorsClear' },
      };
};

/** The drift of a positioning tag; red only above the bound, as the server. */
const describeSurveyDrift = (
  stats: RtlsDeviceStats
): Omit<FleetHealthMetric, 'id'> => {
  const drift = stats.surveyDriftM;
  if (drift === undefined || !isTagPositioned(stats)) {
    return UNKNOWN;
  }
  return {
    status:
      drift > SURVEY_DRIFT_ZONES_M.red
        ? Status.ERROR
        : drift >= SURVEY_DRIFT_ZONES_M.yellow
          ? Status.WARNING
          : Status.SUCCESS,
    text: {
      key: 'rtlsFleetHealth.value.surveyDrift',
      values: { drift: (drift * 100).toFixed(1) },
    },
  };
};

const describeWifi = (
  stats: RtlsDeviceStats
): Omit<FleetHealthMetric, 'id'> => {
  const { wifiDisconnects, wifiRssiDbm } = stats;
  if (wifiRssiDbm === undefined) {
    return UNKNOWN;
  }

  const zone = zoneBelow(wifiRssiDbm, WIFI_RSSI_ZONES_DBM);
  const rssi = wifiRssiDbm.toFixed(0);
  // an association lost since boot is worth a look even on a strong link
  if (wifiDisconnects !== undefined && wifiDisconnects > 0) {
    return {
      status: zone === Status.SUCCESS ? Status.WARNING : zone,
      text: {
        key: 'rtlsFleetHealth.value.wifiDisconnects',
        values: { rssi, count: wifiDisconnects },
      },
    };
  }

  return {
    status: zone,
    text: { key: 'rtlsFleetHealth.value.wifi', values: { rssi } },
  };
};

/**
 * The fleet-health metrics of one tag's drone, in display order; a metric
 * the firmware or the drone does not report is present with `Status.OFF`.
 * `anchorNames` names the rows of the tag's table in its anchor masks.
 */
export const describeFleetHealth = (
  stats: RtlsDeviceStats | undefined,
  anchorNames?: AnchorNames
): FleetHealthMetric[] => {
  if (!stats) {
    return [];
  }

  const { residualRmsM, uwbRssiDbm } = stats;
  return [
    {
      id: 'imuTemperature',
      ...describeImuTemperature(stats.imuTemperaturesC),
    },
    {
      id: 'uwbRssi',
      ...(uwbRssiDbm === undefined
        ? UNKNOWN
        : {
            status: zoneBelow(uwbRssiDbm, UWB_RSSI_ZONES_DBM),
            text: {
              key: 'rtlsFleetHealth.value.uwbRssi',
              values: { rssi: uwbRssiDbm.toFixed(1) },
            },
          }),
    },
    { id: 'anchorSet', ...describeAnchorSet(stats) },
    { id: 'surveyDrift', ...describeSurveyDrift(stats) },
    {
      id: 'nlosAnchors',
      ...describeAnchorMask(stats.nlosMask, NLOS_ANCHOR_ZONES, anchorNames),
    },
    {
      id: 'outvotedAnchors',
      ...describeAnchorMask(
        stats.outvotedMask,
        OUTVOTED_ANCHOR_ZONES,
        anchorNames
      ),
    },
    {
      id: 'residual',
      ...(residualRmsM === undefined
        ? UNKNOWN
        : {
            status: zoneAbove(residualRmsM, RESIDUAL_ZONES_M),
            text: {
              key: 'rtlsFleetHealth.value.residual',
              values: { residual: (residualRmsM * 100).toFixed(1) },
            },
          }),
    },
    { id: 'wifi', ...describeWifi(stats) },
  ];
};

/**
 * The metric that sets a drone's zone: the first of its worst known metrics,
 * undefined if none is known.
 */
export const getWorstFleetHealthMetric = (
  metrics: FleetHealthMetric[]
): FleetHealthMetric | undefined =>
  metrics.reduce<FleetHealthMetric | undefined>(
    (worst, metric) =>
      statusToPriority(metric.status) >
      statusToPriority(worst?.status ?? Status.OFF)
        ? metric
        : worst,
    undefined
  );

/** A drone's zone: that of its worst known metric, `Status.OFF` if none. */
export const getFleetHealthStatus = (
  stats: RtlsDeviceStats | undefined
): Status =>
  getWorstFleetHealthMetric(describeFleetHealth(stats))?.status ?? Status.OFF;

/**
 * The fleet summary: how many drones are green, yellow and red, in the color
 * of the worst one. Drones without any known metric are not counted.
 */
export const summarizeFleetHealth = (
  statsList: Array<RtlsDeviceStats | undefined>
): { status: Status; text: I18nText } => {
  const counts = { ok: 0, warning: 0, error: 0 };
  let status = Status.OFF;
  for (const stats of statsList) {
    const worst = getFleetHealthStatus(stats);
    if (worst === Status.SUCCESS) {
      counts.ok++;
    } else if (worst === Status.WARNING) {
      counts.warning++;
    } else if (worst === Status.ERROR) {
      counts.error++;
    }

    if (statusToPriority(worst) > statusToPriority(status)) {
      status = worst;
    }
  }

  return status === Status.OFF
    ? { status, text: { key: 'rtlsFleetHealth.summary.none' } }
    : {
        status,
        text: { key: 'rtlsFleetHealth.summary.counts', values: counts },
      };
};
