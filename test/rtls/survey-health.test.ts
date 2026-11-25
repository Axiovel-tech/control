import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  buildRtlsDeviceStatusMap,
  buildRtlsStatsMap,
  mapRtlsAnchors,
} from '~/features/rtls/handlers';
import { mapCellSurvey } from '~/features/rtls/handlers-survey';
import { isRangeDeviating, isTagPositioned } from '~/features/rtls/stats-utils';
import {
  describeAnchorSurveyChip,
  describeCellSurveyPill,
  describeTagSurvey,
  describeTagSurveyChip,
  describeTagSurveyPill,
  tableAnchorNamer,
  tableRowNames,
} from '~/features/rtls/survey-health';
import { type RtlsDevice, type RtlsDeviceStats } from '~/features/rtls/types';

import {
  INFORMATION,
  INFORMATION_BLANK,
  INFORMATION_CLEAN,
  STATS,
  STATS_TAG_NO_SURVEY,
} from './switch-recording';

// the recorded messages, mapped as the app maps them
const devices = Object.entries(
  buildRtlsDeviceStatusMap(INFORMATION.status)
).map(([id, device]): RtlsDevice => ({ id, ...device }));
const device = (id: string): RtlsDevice =>
  devices.find((entry) => entry.id === id)!; // non-null: a recorded id
const tags = devices.filter(({ role }) => role === 'tag');
const siteAnchors = mapRtlsAnchors(INFORMATION.anchors);
const site = (id: number) =>
  siteAnchors.find((anchor) => anchor.systemId === id);
const stats = buildRtlsStatsMap(STATS.stats);
const survey = mapCellSurvey(INFORMATION.survey);
const clean = mapCellSurvey(INFORMATION_CLEAN.survey);
const blank = mapCellSurvey(INFORMATION_BLANK.survey);
const nameOf = tableAnchorNamer(siteAnchors);
/** The cell of the recording: on survey 12, its anchors at two heights. */
const CELL = { surveyId: 12, planar: false };

describe('the survey pill of the anchors panel', () => {
  test('the survey and how many anchors are on it; green with none out', () => {
    expect(describeCellSurveyPill(clean)).toEqual({
      status: Status.SUCCESS,
      text: {
        key: 'rtlsSurveyHealth.cell.ok',
        values: { id: 12, count: 6, out: 0 },
      },
    });
  });

  test('amber while an online anchor is off the survey', () => {
    expect(describeCellSurveyPill(survey)).toEqual({
      status: Status.WARNING,
      text: {
        key: 'rtlsSurveyHealth.cell.out',
        values: { id: 12, count: 4, out: 2 },
      },
    });
  });

  test('red while no anchor is surveyed', () => {
    expect(describeCellSurveyPill(blank)).toMatchObject({
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.cell.none' },
    });
  });

  test('nothing from a server that reports no survey', () => {
    expect(mapCellSurvey(undefined)).toBeUndefined();
    expect(mapCellSurvey({ geometry: 'agree' })).toBeUndefined();
    expect(describeCellSurveyPill(undefined)).toBeUndefined();
  });
});

describe('the survey chip of an anchor row', () => {
  const chip = (id: number) =>
    describeAnchorSurveyChip(device(String(id)), stats[id], site(id), survey);

  test('the survey ID of an anchor on the cell survey', () => {
    expect(chip(201)).toEqual({
      status: Status.INFO,
      text: { key: 'rtlsSurveyHealth.anchor.survey', values: { id: 12 } },
    });
  });

  test('"not surveyed", amber', () => {
    expect(chip(203)).toMatchObject({
      status: Status.WARNING,
      text: { key: 'rtlsSurveyHealth.anchor.notSurveyed' },
    });
  });

  test('"other survey" with the ID it is on, amber', () => {
    expect(chip(204)).toMatchObject({
      status: Status.WARNING,
      text: {
        key: 'rtlsSurveyHealth.anchor.otherSurveyId',
        values: { id: 11 },
      },
    });
  });

  test('a lost anchor shows the ID it stores, in grey', () => {
    const lost = { ...device('201'), online: false };
    expect(
      describeAnchorSurveyChip(
        lost,
        { ...stats['201'], stale: true },
        site(201),
        clean
      )
    ).toEqual({
      status: Status.OFF,
      text: { key: 'rtlsSurveyHealth.anchor.survey', values: { id: 12 } },
    });
    // and nothing when it stores none
    expect(
      describeAnchorSurveyChip(lost, undefined, site(203), clean)
    ).toBeUndefined();
  });

  test('no chip from a server that reports no survey', () => {
    expect(
      describeAnchorSurveyChip(
        device('201'),
        stats['201'],
        site(201),
        undefined
      )
    ).toBeUndefined();
  });
});

describe("an anchor's range check", () => {
  test('warns past 8 cm either way, and only with a reading', () => {
    expect(isRangeDeviating(stats['202'])).toBe(true);
    expect(isRangeDeviating(stats['204'])).toBe(false);
    expect(isRangeDeviating(stats['201'])).toBe(false);
    expect(isRangeDeviating({ id: '1', rangeDeviationM: 0.0801 })).toBe(true);
    // the bound itself does not warn
    expect(isRangeDeviating({ id: '1', rangeDeviationM: 0.08 })).toBe(false);
    expect(isRangeDeviating({ id: '1', rangeDeviationM: -0.08 })).toBe(false);
  });
});

describe('whether a tag positions', () => {
  test('from its survey ID and the anchors it uses', () => {
    expect(isTagPositioned(stats['42'], CELL)).toBe(true);
    expect(
      isTagPositioned({ id: '1', surveyId: 12, anchorsUsed: 0 }, CELL)
    ).toBe(false);
    expect(isTagPositioned({ id: '1', anchorsUsed: 4 }, CELL)).toBe(false);
  });

  test('never from the show clock, which runs in a cell with no survey', () => {
    const noSurvey = buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'];
    expect(noSurvey).not.toHaveProperty('clockSyncOk');
    expect(isTagPositioned(noSurvey, CELL)).toBe(false);
  });

  test('unknown while the firmware reports no table', () => {
    expect(isTagPositioned({ id: '1', solveRateHz: 80 }, CELL)).toBeUndefined();
    expect(isTagPositioned(undefined, CELL)).toBeUndefined();
  });
});

describe('the survey pill of the tags panel', () => {
  test('green with the survey ID', () => {
    const all = {
      ...stats,
      '42': { ...stats['42'], anchorsUsed: 4, anchorsExcluded: 0 },
    };
    expect(describeTagSurveyPill(clean, tags, all)).toEqual({
      status: Status.SUCCESS,
      text: { key: 'rtlsSurveyHealth.tags.ok', values: { id: 12 } },
    });
  });

  test('amber with how many tags leave an anchor out', () => {
    expect(describeTagSurveyPill(survey, tags, stats)).toEqual({
      status: Status.WARNING,
      text: { key: 'rtlsSurveyHealth.tags.excluding', values: { count: 1 } },
    });
  });

  test('red while there is no survey', () => {
    expect(describeTagSurveyPill(blank, tags, stats)).toMatchObject({
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tags.none' },
    });
  });

  test('red while a reporting tag is not on the survey of the cell', () => {
    const noSurvey = buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats);
    expect(describeTagSurveyPill(clean, tags, noSurvey)).toEqual({
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tags.off', values: { count: 1, id: 12 } },
    });
    expect(
      describeTagSurveyPill(clean, tags, {
        '42': { ...stats['42'], surveyId: 11, anchorsExcluded: 0 },
      })
    ).toMatchObject({ status: Status.ERROR });
    // a sleeping tag reports nothing and is not counted
    expect(
      describeTagSurveyPill(clean, [device('43')], {
        '43': noSurvey['42'],
      })
    ).toMatchObject({ status: Status.SUCCESS });
  });

  test('no pill from a server that reports no survey', () => {
    expect(describeTagSurveyPill(undefined, tags, stats)).toBeUndefined();
  });
});

describe('the survey pill of a tag row', () => {
  const tagChip = (tag: RtlsDevice, tagStats: RtlsDeviceStats | undefined) =>
    describeTagSurveyChip(tag, tagStats, CELL);

  test('amber: the survey, the anchors used and how many are out', () => {
    expect(tagChip(device('42'), stats['42'])).toEqual({
      status: Status.WARNING,
      text: {
        key: 'rtlsSurveyHealth.tag.excluding',
        values: { id: 12, count: 4, excluded: 2 },
      },
    });
  });

  test('green on every anchor, red on none', () => {
    expect(
      tagChip(device('42'), {
        ...stats['42'],
        anchorsUsed: 4,
        anchorsExcluded: 0,
      })
    ).toMatchObject({
      status: Status.SUCCESS,
      text: { key: 'rtlsSurveyHealth.tag.ok', values: { id: 12, count: 4 } },
    });
    expect(
      tagChip(device('42'), buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'])
    ).toMatchObject({
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tag.none' },
    });
  });

  test('none for a tag that reports nothing now', () => {
    expect(tagChip(device('43'), stats['42'])).toBeUndefined();
    expect(
      tagChip({ ...device('42'), online: false }, stats['42'])
    ).toBeUndefined();
    expect(
      tagChip(device('42'), { id: '42', solveRateHz: 80 })
    ).toBeUndefined();
  });
});

describe("the anchors of a tag's table", () => {
  test('are named by slot when the site list has them', () => {
    expect(nameOf({ mac: 2, systemId: 202 })).toBe('A1');
    // an anchor the server lost is still found by its MAC
    expect(nameOf({ mac: 3 })).toBe('A2');
  });

  test('else by system id, else by MAC', () => {
    expect(nameOf({ mac: 9, systemId: 209 })).toBe('#209');
    expect(nameOf({ mac: 9 })).toBe('0x0009');
  });

  test('rows are named from the table, not from the slots', () => {
    // the tag heard A1 first: its row 0 is A1 and its row 1 is A0
    expect(tableRowNames(stats['42'].anchorTable, nameOf)).toEqual([
      'A1',
      'A0',
      'A4',
      'A5',
    ]);
    expect(tableRowNames(undefined, nameOf)).toEqual([]);
  });
});

describe("a tag's survey line", () => {
  test('the survey, the anchors used, who is out and why, and the drift', () => {
    expect(describeTagSurvey(stats['42'], nameOf, CELL)).toEqual({
      following: {
        key: 'rtlsSurveyHealth.line.following',
        values: { id: 12, count: 4 },
      },
      excluded: [
        { anchor: 'A2', why: { key: 'rtlsSurveyHealth.why.noPosition' } },
        { anchor: 'A3', why: { key: 'rtlsSurveyHealth.why.otherSurvey' } },
      ],
      unnamed: undefined,
      drift: { key: 'rtlsSurveyHealth.line.drift', values: { drift: '3.1' } },
    });
  });

  test('anchors counted out before the table names them are counted', () => {
    const line = describeTagSurvey(
      buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'],
      nameOf,
      CELL
    );
    expect(line).toMatchObject({
      following: { key: 'rtlsSurveyHealth.line.none' },
      excluded: [
        { anchor: 'A0', why: { key: 'rtlsSurveyHealth.why.noPosition' } },
        { anchor: '0x0009', why: { key: 'rtlsSurveyHealth.why.noPosition' } },
      ],
      unnamed: { key: 'rtlsSurveyHealth.line.unnamed', values: { count: 2 } },
    });
    // no drift is claimed for a tag that positions on nothing
    expect(line?.drift).toBeUndefined();
  });

  test('none while the tag reports no table', () => {
    expect(describeTagSurvey({ id: '1', solveRateHz: 80 }, nameOf, CELL)).toBe(
      undefined
    );
  });
});
