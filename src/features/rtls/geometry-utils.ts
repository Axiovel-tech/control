/**
 * @file Pure helpers over the automatic cell geometry: the per-tag status
 * pill and the fleet summary of the last X-RTLS-GEOM agreement check.
 *
 * Every tag fits the anchor table itself at boot (rtls-link-zephyr#208) and
 * streams the fit as health stats; the server grades the fleet in
 * X-RTLS-GEOM. Nothing here writes geometry anywhere.
 */

import { Status } from '~/components/semantics';

import {
  type RtlsDeviceStats,
  type RtlsGeometryAgreement,
  type RtlsGeometryAgreementEntry,
  RtlsGeometryState,
} from './types';

/** Human label of a firmware geometry state code. */
export const describeGeometryState = (
  state: RtlsGeometryState | undefined
): string => {
  switch (state) {
    case RtlsGeometryState.MANUAL:
      return 'manual table';
    case RtlsGeometryState.WAITING:
      return 'waiting for anchors';
    case RtlsGeometryState.CALIBRATING:
      return 'calibrating';
    case RtlsGeometryState.CALIBRATED:
      return 'calibrated';
    case RtlsGeometryState.FAILED:
      return 'fit failed';
    default:
      return 'no geometry';
  }
};

const formatCm = (metres: number): string => `${(metres * 100).toFixed(1)} cm`;

/**
 * The geometry pill of one tag row: the agreement verdict when the last
 * check graded this tag, the live fit state from the stats otherwise. No
 * pill for a device without geometry telemetry (anchors, old firmware).
 */
export const geometryPillFor = (
  stats: RtlsDeviceStats | undefined,
  entry: RtlsGeometryAgreementEntry | undefined
): { label?: string; status?: Status } => {
  if (entry) {
    switch (entry.status) {
      case 'agree':
        return {
          label:
            entry.maxDeviationM === undefined
              ? 'geometry ok'
              : `geometry ok (${formatCm(entry.maxDeviationM)})`,
          status: Status.SUCCESS,
        };
      case 'deviates':
        return {
          label:
            entry.maxDeviationM === undefined
              ? 'geometry deviates'
              : `geometry deviates (${formatCm(entry.maxDeviationM)})`,
          status: Status.ERROR,
        };
      case 'manual':
        return { label: 'geometry manual', status: Status.INFO };
      case 'calibrating':
        return { label: 'geometry calibrating', status: Status.WARNING };
      case 'failed':
        return { label: 'geometry fit failed', status: Status.ERROR };
      case 'stale':
        return { label: 'geometry stale', status: Status.WARNING };
      default:
        return { label: 'geometry unknown', status: Status.WARNING };
    }
  }

  const state = stats?.geometryState;
  if (state === undefined) {
    return {};
  }

  switch (state) {
    case RtlsGeometryState.CALIBRATED:
      return { label: 'geometry calibrated', status: Status.INFO };
    case RtlsGeometryState.MANUAL:
      return { label: 'geometry manual', status: Status.INFO };
    case RtlsGeometryState.FAILED:
      return { label: 'geometry fit failed', status: Status.ERROR };
    default:
      return { label: 'geometry calibrating', status: Status.WARNING };
  }
};

export type GeometryAgreementSummary = {
  label: string;
  status: Status;
  /** Number of tags that deviate or cannot be certified. */
  problems: number;
};

/**
 * One-line fleet verdict of the last agreement check for the tags panel
 * toolbar.
 */
export const summarizeGeometryAgreement = (
  check: RtlsGeometryAgreement | undefined
): GeometryAgreementSummary => {
  if (!check) {
    return { label: 'geometry unchecked', status: Status.OFF, problems: 0 };
  }

  const entries = Object.values(check.devices);
  const agreeing = entries.filter((entry) => entry.status === 'agree').length;
  const deviating = entries.filter(
    (entry) => entry.status === 'deviates'
  ).length;
  const manual = entries.filter((entry) => entry.status === 'manual').length;
  const pending = entries.length - agreeing - deviating - manual;

  if (entries.length === 0) {
    return { label: 'geometry: no tags', status: Status.OFF, problems: 0 };
  }

  if (deviating > 0) {
    return {
      label: `geometry: ${deviating} deviating`,
      status: Status.ERROR,
      problems: deviating + pending,
    };
  }

  if (pending > 0) {
    return {
      label: `geometry: ${pending} not calibrated`,
      status: Status.WARNING,
      problems: pending,
    };
  }

  const maxDeviation = Math.max(
    0,
    ...entries.map((entry) => entry.maxDeviationM ?? 0)
  );
  const detail =
    agreeing > 0 ? ` (${agreeing} agree, max ${formatCm(maxDeviation)})` : '';
  return {
    label:
      manual > 0 && agreeing === 0
        ? `geometry: ${manual} manual`
        : `geometry consistent${detail}`,
    status:
      check.consistent || agreeing === 0 ? Status.SUCCESS : Status.WARNING,
    problems: 0,
  };
};
