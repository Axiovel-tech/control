/**
 * @file Pure helpers over the automatic cell geometry: the per-tag status
 * pill and the fleet summary of the last X-RTLS-GEOM agreement check.
 *
 * Every tag fits the anchor table itself at boot (rtls-link-zephyr#208) and
 * streams the fit as health stats; the server grades the fleet in
 * X-RTLS-GEOM. Nothing here writes geometry anywhere.
 *
 * The helpers return i18n descriptors (resource key + interpolation values)
 * rather than text, so components translate them with `t(key, values)` and
 * the strings live in the resources (see AGENTS.md, I18n).
 */

import { Status } from '~/components/semantics';

import {
  type RtlsDeviceStats,
  type RtlsGeometryAgreement,
  type RtlsGeometryAgreementEntry,
  RtlsGeometryState,
} from './types';

/** A translatable text: an i18n resource key and its interpolation values. */
export type I18nText = {
  key: string;
  values?: Record<string, number | string>;
};

const STATE_KEYS: Record<RtlsGeometryState, string> = {
  [RtlsGeometryState.MANUAL]: 'manual',
  [RtlsGeometryState.WAITING]: 'waiting',
  [RtlsGeometryState.CALIBRATING]: 'calibrating',
  [RtlsGeometryState.CALIBRATED]: 'calibrated',
  [RtlsGeometryState.FAILED]: 'failed',
};

/** Text of a firmware geometry state code. */
export const describeGeometryState = (
  state: RtlsGeometryState | undefined
): I18nText => ({
  key: `rtlsGeometry.state.${
    state === undefined ? 'none' : (STATE_KEYS[state] ?? 'none')
  }`,
});

/** Centimetres with one decimal, for interpolation. */
const cm = (metres: number): string => (metres * 100).toFixed(1);

/**
 * The "Geometry" telemetry line of a tag: fit state, then the rectangle
 * residual and, when noticeable, the live drift since calibration (a moved
 * tripod). Undefined for a device without geometry telemetry.
 */
export const describeGeometryFit = (
  stats: RtlsDeviceStats | undefined
): I18nText | undefined => {
  const state = stats?.geometryState;
  if (state === undefined) {
    return undefined;
  }

  if (state !== RtlsGeometryState.CALIBRATED) {
    return describeGeometryState(state);
  }

  // the fields arrive one at a time (and older firmware sends neither):
  // an absent metric is unknown, not a perfect zero
  if (
    stats?.geometryResidualM === undefined ||
    stats?.geometryDriftM === undefined
  ) {
    return { key: 'rtlsGeometry.fit.calibratedPending' };
  }

  const residual = cm(stats.geometryResidualM);
  const drift = stats.geometryDriftM;
  return drift >= 0.01
    ? {
        key: 'rtlsGeometry.fit.calibratedDrift',
        values: { residual, drift: cm(drift) },
      }
    : { key: 'rtlsGeometry.fit.calibrated', values: { residual } };
};

/**
 * The geometry pill of one tag row: the agreement verdict when the last
 * check graded this tag, the live fit state from the stats otherwise. No
 * pill for a device without geometry telemetry (anchors, old firmware).
 */
export const geometryPillFor = (
  stats: RtlsDeviceStats | undefined,
  entry: RtlsGeometryAgreementEntry | undefined
): { text?: I18nText; status?: Status } => {
  if (entry) {
    switch (entry.status) {
      case 'agree':
        return {
          text:
            entry.maxDeviationM === undefined
              ? { key: 'rtlsGeometry.pill.ok' }
              : {
                  key: 'rtlsGeometry.pill.okDeviation',
                  values: { deviation: cm(entry.maxDeviationM) },
                },
          status: Status.SUCCESS,
        };
      case 'deviates':
        return {
          text:
            entry.maxDeviationM === undefined
              ? { key: 'rtlsGeometry.pill.deviates' }
              : {
                  key: 'rtlsGeometry.pill.deviatesDeviation',
                  values: { deviation: cm(entry.maxDeviationM) },
                },
          status: Status.ERROR,
        };
      case 'drifted':
        return {
          text:
            entry.driftM === undefined
              ? { key: 'rtlsGeometry.pill.drifted' }
              : {
                  key: 'rtlsGeometry.pill.driftedDrift',
                  values: { drift: cm(entry.driftM) },
                },
          status: Status.ERROR,
        };
      case 'frame':
        return {
          text: { key: 'rtlsGeometry.pill.frame' },
          status: Status.ERROR,
        };
      case 'manual':
        return {
          text: { key: 'rtlsGeometry.pill.manual' },
          status: Status.INFO,
        };
      case 'calibrating':
        return {
          text: { key: 'rtlsGeometry.pill.calibrating' },
          status: Status.WARNING,
        };
      case 'failed':
        return {
          text: { key: 'rtlsGeometry.pill.failed' },
          status: Status.ERROR,
        };
      case 'stale':
        return {
          text: { key: 'rtlsGeometry.pill.stale' },
          status: Status.WARNING,
        };
      default:
        return {
          text: { key: 'rtlsGeometry.pill.unknown' },
          status: Status.WARNING,
        };
    }
  }

  const state = stats?.geometryState;
  if (state === undefined) {
    return {};
  }

  switch (state) {
    case RtlsGeometryState.CALIBRATED:
      return {
        text: { key: 'rtlsGeometry.pill.calibrated' },
        status: Status.INFO,
      };
    case RtlsGeometryState.MANUAL:
      return { text: { key: 'rtlsGeometry.pill.manual' }, status: Status.INFO };
    case RtlsGeometryState.FAILED:
      return {
        text: { key: 'rtlsGeometry.pill.failed' },
        status: Status.ERROR,
      };
    default:
      return {
        text: { key: 'rtlsGeometry.pill.calibrating' },
        status: Status.WARNING,
      };
  }
};

export type GeometryAgreementSummary = I18nText & {
  status: Status;
  /** Number of tags that deviate, drifted or cannot be certified. */
  problems: number;
};

/**
 * One-line fleet verdict of the last agreement check for the tags panel
 * toolbar and the check's snackbar.
 */
export const describeGeometryAgreement = (
  check: RtlsGeometryAgreement | undefined
): GeometryAgreementSummary => {
  if (!check) {
    return {
      key: 'rtlsGeometry.summary.unchecked',
      status: Status.OFF,
      problems: 0,
    };
  }

  const entries = Object.values(check.devices);
  const count = (status: RtlsGeometryAgreementEntry['status']): number =>
    entries.filter((entry) => entry.status === status).length;
  const agreeing = count('agree');
  const deviating = count('deviates') + count('frame');
  const drifted = count('drifted');
  const manual = count('manual');
  const pending = entries.length - agreeing - deviating - drifted - manual;

  if (entries.length === 0) {
    return {
      key: 'rtlsGeometry.summary.noTags',
      status: Status.OFF,
      problems: 0,
    };
  }

  if (deviating > 0) {
    return {
      key: 'rtlsGeometry.summary.deviating',
      values: { count: deviating },
      status: Status.ERROR,
      problems: deviating + drifted + pending,
    };
  }

  if (drifted > 0) {
    return {
      key: 'rtlsGeometry.summary.drifted',
      values: { count: drifted },
      status: Status.ERROR,
      problems: drifted + pending,
    };
  }

  if (pending > 0) {
    return {
      key: 'rtlsGeometry.summary.notCalibrated',
      values: { count: pending },
      status: Status.WARNING,
      problems: pending,
    };
  }

  if (agreeing === 0) {
    return {
      key: 'rtlsGeometry.summary.manualOnly',
      values: { count: manual },
      status: Status.SUCCESS,
      problems: 0,
    };
  }

  const maxDeviation = Math.max(
    0,
    ...entries.map((entry) => entry.maxDeviationM ?? 0)
  );
  return {
    key: 'rtlsGeometry.summary.consistent',
    values: { count: agreeing, deviation: cm(maxDeviation) },
    status: check.consistent ? Status.SUCCESS : Status.WARNING,
    problems: 0,
  };
};
