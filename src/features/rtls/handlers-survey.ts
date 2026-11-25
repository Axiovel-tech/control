/**
 * @file Mapping of what the server reports of the survey the cell is on: the
 * `survey` member of X-RTLS-INF and the anchor table in a tag's stats. Absent
 * or malformed members read as absent.
 */

import {
  type RtlsAnchorTableEntry,
  type RtlsAnchorTableState,
  type RtlsCellSurvey,
} from './types';
import { isRecord, toNumber } from './wire-values';

const ANCHOR_TABLE_STATES: readonly RtlsAnchorTableState[] = [
  'in-use',
  'other-survey',
  'no-position',
  'unknown-layout',
  'table-full',
];

/**
 * Maps the anchors a tag names (`anchorTable` of its stats, or its list in
 * `survey.excluding`). An entry without a MAC is dropped; a state newer than
 * this client reads `unknown`.
 */
export function mapAnchorTable(value: unknown): RtlsAnchorTableEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((raw) => {
    const mac = isRecord(raw) ? toNumber(raw.mac) : undefined;
    if (!isRecord(raw) || mac === undefined) {
      return [];
    }
    return [
      {
        row: toNumber(raw.row),
        mac,
        state:
          ANCHOR_TABLE_STATES.find((state) => state === raw.state) ?? 'unknown',
        systemId: toNumber(raw.systemId),
      },
    ];
  });
}

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id) => toNumber(id) !== undefined).map(String)
    : [];

/**
 * Maps the server's `survey`: the survey the cell is on. `undefined` for a
 * server without it, whose clients show no survey state.
 */
export function mapCellSurvey(value: unknown): RtlsCellSurvey | undefined {
  if (!isRecord(value) || !Array.isArray(value.notSurveyed)) {
    return undefined;
  }
  const excluding: RtlsCellSurvey['excluding'] = {};
  if (isRecord(value.excluding)) {
    for (const [tag, anchors] of Object.entries(value.excluding)) {
      excluding[tag] = mapAnchorTable(anchors).map(
        ({ mac, state, systemId }) => ({ mac, state, systemId })
      );
    }
  }
  return {
    id: toNumber(value.id),
    anchors: toNumber(value.anchors) ?? 0,
    notSurveyed: toIds(value.notSurveyed),
    otherSurvey: toIds(value.otherSurvey),
    rangeDeviation: toIds(value.rangeDeviation),
    excluding,
  };
}
