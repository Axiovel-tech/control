/**
 * @file The survey as the health display shows it: the anchors own the
 * geometry (each stores its position and a survey ID and advertises them),
 * and a tag positions on the anchors of one survey ID that it hears. Pure
 * helpers over the server's `survey` (X-RTLS-INF) and the devices' stats:
 * the pills of the two role panels, an anchor's survey chip, a tag's survey
 * line and how its table names the anchors.
 *
 */

import { Status } from '~/components/semantics';

import { type StatusText } from './anchor-utils';
import { type I18nText } from './i18n-text';
import {
  classifyRole,
  isTagPositioned,
  RtlsRole,
  type RtlsTagCell,
} from './stats-utils';
import {
  type RtlsAnchor,
  type RtlsAnchorTableEntry,
  type RtlsAnchorTableState,
  type RtlsCellSurvey,
  type RtlsDevice,
  type RtlsDeviceStats,
} from './types';

const formatMac = (mac: number): string =>
  `0x${mac.toString(16).padStart(4, '0').toUpperCase()}`;

/** Names an anchor a tag's table names, by what the site list knows of it. */
export type TableAnchorNamer = (
  anchor: Pick<RtlsAnchorTableEntry, 'mac' | 'systemId'>
) => string;

/**
 * How the anchors of a tag's table are named: by slot (`A3`), as the anchors
 * panel and the survey page name them, when the site list has the anchor
 * (found by system id, else by MAC); else by system id (`#203`); else by MAC.
 */
export const tableAnchorNamer = (
  siteAnchors: readonly RtlsAnchor[]
): TableAnchorNamer => {
  const slotOf = (match: (anchor: RtlsAnchor) => boolean): number | undefined =>
    siteAnchors.find(match)?.index;
  return ({ mac, systemId }) => {
    const slot =
      (systemId === undefined
        ? undefined
        : slotOf((anchor) => anchor.systemId === systemId)) ??
      slotOf((anchor) => anchor.mac === mac);
    return slot === undefined
      ? systemId === undefined
        ? formatMac(mac)
        : `#${systemId}`
      : `A${slot}`;
  };
};

/**
 * The anchor names of a tag's rows, by row: bit i of its anchor masks is
 * row i. A row the table does not name (yet) is absent.
 */
export const tableRowNames = (
  table: readonly RtlsAnchorTableEntry[] | undefined,
  nameOf: TableAnchorNamer
): Array<string | undefined> => {
  const names: Array<string | undefined> = [];
  for (const entry of table ?? []) {
    if (entry.row !== undefined) {
      names[entry.row] = nameOf(entry);
    }
  }
  return names;
};

/** The anchors a tag's table names as left out. */
export const excludedAnchors = (
  stats: RtlsDeviceStats | undefined
): RtlsAnchorTableEntry[] =>
  (stats?.anchorTable ?? []).filter(({ state }) => state !== 'in-use');

const EXCLUSION_KEYS: Record<RtlsAnchorTableState, string> = {
  'in-use': 'unknown',
  'other-survey': 'otherSurvey',
  'no-position': 'noPosition',
  'unknown-layout': 'unknownLayout',
  'table-full': 'tableFull',
  unknown: 'unknown',
};

/** Why a tag leaves an anchor out. */
export const describeExclusion = (state: RtlsAnchorTableState): I18nText => ({
  key: `rtlsSurveyHealth.why.${EXCLUSION_KEYS[state]}`,
});

/** Centimetres with one decimal, for interpolation. */
const cm = (metres: number): string => (metres * 100).toFixed(1);

/**
 * The pill of the anchors panel: the survey the cell is on and how many
 * online anchors are on it, amber while any online anchor is not, red while
 * none is surveyed. `undefined` for a server that reports no survey.
 */
export const describeCellSurveyPill = (
  survey: RtlsCellSurvey | undefined
): StatusText | undefined => {
  if (survey === undefined) {
    return undefined;
  }
  if (survey.id === undefined) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.cell.none' },
    };
  }
  const out = survey.notSurveyed.length + survey.otherSurvey.length;
  const values = { id: survey.id, count: survey.anchors, out };
  return out > 0
    ? {
        status: Status.WARNING,
        text: { key: 'rtlsSurveyHealth.cell.out', values },
      }
    : {
        status: Status.SUCCESS,
        text: { key: 'rtlsSurveyHealth.cell.ok', values },
      };
};

/**
 * The survey chip of an anchor row: the survey ID it is on, "not surveyed",
 * or "other survey" when it is on another one than the cell. Which of them
 * is the server's verdict for an online anchor; a lost anchor shows the ID
 * it stores, in grey. `undefined` for a server that reports no survey and
 * for a lost anchor that stores none.
 */
export const describeAnchorSurveyChip = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined,
  site: RtlsAnchor | undefined,
  survey: RtlsCellSurvey | undefined
): StatusText | undefined => {
  if (survey === undefined) {
    return undefined;
  }
  const own = (stats?.stale ? undefined : stats?.surveyId) ?? site?.surveyId;
  if (survey.notSurveyed.includes(device.id)) {
    return {
      status: Status.WARNING,
      text: { key: 'rtlsSurveyHealth.anchor.notSurveyed' },
    };
  }
  if (survey.otherSurvey.includes(device.id)) {
    return {
      status: Status.WARNING,
      text:
        own === undefined
          ? { key: 'rtlsSurveyHealth.anchor.otherSurvey' }
          : {
              key: 'rtlsSurveyHealth.anchor.otherSurveyId',
              values: { id: own },
            },
      tooltip: { key: 'rtlsSurveyHealth.anchorTooltip.otherSurvey' },
    };
  }
  if (own === undefined) {
    return undefined;
  }
  return {
    status: device.online ? Status.INFO : Status.OFF,
    text: { key: 'rtlsSurveyHealth.anchor.survey', values: { id: own } },
  };
};

/** A tag's stats while it reports: online, awake and not a stale snapshot. */
const reporting = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined
): RtlsDeviceStats | undefined =>
  device.online && !device.sleeping && !stats?.stale ? stats : undefined;

/**
 * Whether a tag owes survey telemetry: it is awake, or was when it was
 * lost. A sleeping tag has its radio off, and a disabled device is out of
 * service.
 */
const owesTelemetry = (device: RtlsDevice): boolean =>
  device.sleeping !== true && classifyRole(device.role) !== RtlsRole.DISABLED;

/**
 * The pill of the tags panel: green with the survey the cell is on, amber
 * with how many tags leave an anchor out, red while there is no survey, a
 * tag does not position on the cell's, or a tag that is awake (or was when
 * it was lost) reports no fresh survey telemetry: what is not known is not
 * good, as in the server's Verify rule. `undefined` for a server that
 * reports no survey.
 */
export const describeTagSurveyPill = (
  survey: RtlsCellSurvey | undefined,
  tags: readonly RtlsDevice[],
  statsById: Record<string, RtlsDeviceStats | undefined>,
  planar = false
): StatusText | undefined => {
  if (survey === undefined) {
    return undefined;
  }
  const { id } = survey;
  if (id === undefined) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tags.none' },
    };
  }
  const owing = tags.filter(owesTelemetry);
  const positioned = (tag: RtlsDevice): boolean | undefined =>
    isTagPositioned(reporting(tag, statsById[tag.id]), {
      surveyId: id,
      planar,
    });
  const off = owing.filter((tag) => positioned(tag) === false).length;
  if (off > 0) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tags.off', values: { count: off, id } },
    };
  }
  const silent = owing.filter((tag) => positioned(tag) === undefined).length;
  if (silent > 0) {
    return {
      status: Status.ERROR,
      text: {
        key: 'rtlsSurveyHealth.tags.noTelemetry',
        values: { count: silent },
      },
    };
  }
  const excluding = Object.keys(survey.excluding).length;
  return excluding > 0
    ? {
        status: Status.WARNING,
        text: {
          key: 'rtlsSurveyHealth.tags.excluding',
          values: { count: excluding },
        },
      }
    : {
        status: Status.SUCCESS,
        text: { key: 'rtlsSurveyHealth.tags.ok', values: { id } },
      };
};

/**
 * The survey pill of one tag row: the survey it follows and how many anchors
 * it uses; amber while it leaves one out, red while it does not position (it
 * follows no survey, or another one than the cell, or uses too few anchors).
 * `undefined` while the tag does not report both how many anchors it uses and
 * how many it leaves out (asleep, lost, older firmware).
 */
export const describeTagSurveyChip = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined,
  cell: RtlsTagCell
): StatusText | undefined => {
  const live = reporting(device, stats);
  const positioned = isTagPositioned(live, cell);
  if (
    live?.anchorsUsed === undefined ||
    live.anchorsExcluded === undefined ||
    positioned === undefined
  ) {
    return undefined;
  }
  if (live.surveyId === undefined) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tag.none' },
    };
  }
  const values = { id: live.surveyId, count: live.anchorsUsed };
  if (live.surveyId !== cell.surveyId) {
    return {
      status: Status.ERROR,
      text: {
        key: 'rtlsSurveyHealth.tag.otherSurvey',
        values: { id: live.surveyId },
      },
    };
  }
  if (!positioned) {
    return {
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tag.tooFew', values },
    };
  }
  const excluded = live.anchorsExcluded;
  return excluded > 0
    ? {
        status: Status.WARNING,
        text: {
          key: 'rtlsSurveyHealth.tag.excluding',
          values: { ...values, excluded },
        },
      }
    : {
        status: Status.SUCCESS,
        text: { key: 'rtlsSurveyHealth.tag.ok', values },
      };
};

/** One anchor a tag leaves out, for its survey line. */
export type ExcludedAnchorText = { anchor: string; why: I18nText };

/**
 * What a tag's "Survey" telemetry line says, part by part: the survey it
 * follows and the anchors it uses, the anchors it leaves out by name with
 * why, how many it leaves out when its table does not name them all, and
 * the drift of its live ranges from the advertised positions. `undefined`
 * while the tag reports no table.
 */
export const describeTagSurvey = (
  stats: RtlsDeviceStats | undefined,
  nameOf: TableAnchorNamer,
  cell: RtlsTagCell
):
  | {
      following: I18nText;
      excluded: ExcludedAnchorText[];
      unnamed?: I18nText;
      drift?: I18nText;
    }
  | undefined => {
  if (stats?.anchorsUsed === undefined) {
    return undefined;
  }
  const positioned = isTagPositioned(stats, cell);
  const excluded = excludedAnchors(stats).map((entry) => ({
    anchor: nameOf(entry),
    why: describeExclusion(entry.state),
  }));
  const unnamed = (stats.anchorsExcluded ?? 0) - excluded.length;
  return {
    // the facts as reported, also of a tag with too few anchors to position
    following:
      stats.surveyId === undefined
        ? { key: 'rtlsSurveyHealth.line.none' }
        : {
            key: 'rtlsSurveyHealth.line.following',
            values: { id: stats.surveyId, count: stats.anchorsUsed },
          },
    excluded,
    unnamed:
      unnamed > 0
        ? { key: 'rtlsSurveyHealth.line.unnamed', values: { count: unnamed } }
        : undefined,
    drift:
      positioned && stats.surveyDriftM !== undefined
        ? {
            key: 'rtlsSurveyHealth.line.drift',
            values: { drift: cm(stats.surveyDriftM) },
          }
        : undefined,
  };
};
