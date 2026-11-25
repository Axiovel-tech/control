import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import { describeAnchorBadges } from '~/features/rtls/anchor-utils';
import {
  buildRtlsStatsMap,
  mapRtlsAnchors,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { mapAnchorTable, mapCellSurvey } from '~/features/rtls/handlers-survey';
import reducer, { setRtlsCellSurvey } from '~/features/rtls/slice';
import { getAnchorHealth, RtlsHealth } from '~/features/rtls/stats-utils';

import { INFORMATION, STATS } from './switch-recording';

describe('X-RTLS-INF once the anchors own the geometry', () => {
  test('an anchor carries the position and survey ID it stores', () => {
    const anchors = mapRtlsAnchors(INFORMATION.anchors);
    expect(anchors[1]).toEqual({
      id: 'rtls::default::anchor_1',
      cell: 'default',
      index: 1,
      mac: 2,
      ned: { north: 4, east: 0, down: 0 },
      surveyId: 12,
      planar: false,
      active: true,
      systemId: 202,
    });
  });

  test('an anchor that is not surveyed has no position and no survey ID', () => {
    const blank = mapRtlsAnchors(INFORMATION.anchors)[2];
    expect(blank.ned).toEqual({});
    expect(blank.surveyId).toBeUndefined();
    expect(blank.planar).toBe(false);
  });

  test('the survey of the cell, ids as the device registry keys them', () => {
    expect(mapCellSurvey(INFORMATION.survey)).toEqual({
      id: 12,
      anchors: 4,
      notSurveyed: ['203'],
      otherSurvey: ['204'],
      rangeDeviation: ['202'],
      excluding: {
        '42': [
          { mac: 3, systemId: 203, state: 'no-position' },
          { mac: 4, systemId: 204, state: 'other-survey' },
        ],
      },
    });
  });

  test('a tag that counts an anchor out before naming it is listed empty', () => {
    expect(
      mapCellSurvey({ ...INFORMATION.survey, excluding: { '42': [] } })
        ?.excluding
    ).toEqual({ '42': [] });
  });

  test('the message sets the survey in the store, and only when it has one', () => {
    const actions = rtlsInformationActions(INFORMATION);
    const state = actions.reduce(
      reducer,
      reducer(undefined, { type: '@@INIT' })
    );
    expect(state.cellSurvey?.id).toBe(12);
    expect(state.anchors).toHaveLength(6);

    // a message without the member leaves the stored one alone
    const { survey: _survey, ...older } = INFORMATION;
    expect(rtlsInformationActions(older).map(({ type }) => type)).not.toContain(
      setRtlsCellSurvey.type
    );
  });
});

describe('X-RTLS-STATS once the anchors own the geometry', () => {
  const stats = buildRtlsStatsMap(STATS.stats);

  test("a tag's survey stats and its table", () => {
    expect(stats['42']).toMatchObject({
      surveyId: 12,
      anchorsUsed: 4,
      anchorsExcluded: 2,
      surveyDriftM: 0.0312,
      anchorTable: [
        { row: 0, mac: 2, state: 'in-use', systemId: 202 },
        { row: 1, mac: 1, state: 'in-use', systemId: 201 },
        { row: 2, mac: 5, state: 'in-use', systemId: 205 },
        { row: 3, mac: 6, state: 'in-use', systemId: 206 },
        { mac: 3, state: 'no-position', systemId: 203 },
        { mac: 4, state: 'other-survey', systemId: 204 },
      ],
    });
    // an anchor left out has no row
    expect(stats['42'].anchorTable?.[4].row).toBeUndefined();
  });

  test('an empty table is a table; none is none', () => {
    expect(
      buildRtlsStatsMap({ '1': { anchorTable: [] } })['1'].anchorTable
    ).toEqual([]);
    expect(buildRtlsStatsMap({ '1': {} })['1'].anchorTable).toBeUndefined();
  });

  test('a state newer than this client reads unknown; no MAC, no entry', () => {
    expect(
      mapAnchorTable([
        { row: null, mac: 5, state: 'jammed', systemId: null },
        { row: 0, state: 'in-use' },
        null,
      ])
    ).toEqual([
      { row: undefined, mac: 5, state: 'unknown', systemId: undefined },
    ]);
  });

  test("an anchor's survey ID and range check", () => {
    expect(stats['202']).toMatchObject({
      surveyId: 12,
      rangeDeviationM: -0.1234,
    });
    expect(stats['203'].surveyId).toBeUndefined();
    expect(stats['201'].rangeDeviationM).toBeUndefined();
  });
});

describe('the range check on an anchor row', () => {
  const stats = buildRtlsStatsMap(STATS.stats);

  test('a badge beside "moved" while the range is past the bound', () => {
    const badges = describeAnchorBadges({ ...stats['202'], moved: true });
    expect(badges.map(({ id }) => id)).toEqual(['moved', 'rangeDeviation']);
    expect(badges[1]).toEqual({
      id: 'rangeDeviation',
      status: Status.WARNING,
      text: { key: 'rtlsAnchor.badge.rangeCloser', values: { cm: 12 } },
      tooltip: { key: 'rtlsAnchor.badgeTooltip.rangeDeviation' },
    });
    expect(
      describeAnchorBadges({ id: '1', rangeDeviationM: 0.093 })[0].text
    ).toEqual({ key: 'rtlsAnchor.badge.rangeFarther', values: { cm: 9 } });
  });

  test('none within the bound, and none without a reading', () => {
    expect(describeAnchorBadges(stats['204'])).toEqual([]);
    expect(describeAnchorBadges(stats['201'])).toEqual([]);
  });

  test('the anchor warns, as one that moved does', () => {
    const live = { online: true, age: 1 };
    expect(getAnchorHealth(live, stats['202'])).toBe(RtlsHealth.WARNING);
    expect(getAnchorHealth(live, stats['204'])).toBe(RtlsHealth.OK);
  });
});
