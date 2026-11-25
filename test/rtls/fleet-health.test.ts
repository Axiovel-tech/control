import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  describeFleetHealth,
  type FleetHealthMetric,
  type FleetHealthMetricId,
  getWorstFleetHealthMetric,
  summarizeFleetHealth,
} from '~/features/rtls/fleet-health';
import { buildRtlsStatsMap, mapRtlsAnchors } from '~/features/rtls/handlers';
import { tableAnchorNamer, tableRowNames } from '~/features/rtls/survey-health';
import { type RtlsDeviceStats } from '~/features/rtls/types';

import { INFORMATION, STATS, STATS_TAG_NO_SURVEY } from './switch-recording';

const tag = buildRtlsStatsMap(STATS.stats)['42'];
const nameOf = tableAnchorNamer(mapRtlsAnchors(INFORMATION.anchors));

const metric = (
  stats: RtlsDeviceStats,
  id: FleetHealthMetricId
): FleetHealthMetric =>
  describeFleetHealth(stats, tableRowNames(stats.anchorTable, nameOf)).find(
    (entry) => entry.id === id
  )!; // non-null: every metric is listed

describe('the pre-show health metrics', () => {
  test('eight of them: the two of the survey join the six', () => {
    expect(describeFleetHealth(tag).map(({ id }) => id)).toEqual([
      'imuTemperature',
      'uwbRssi',
      'anchorSet',
      'surveyDrift',
      'nlosAnchors',
      'outvotedAnchors',
      'residual',
      'wifi',
    ]);
  });
});

describe('"Anchor set"', () => {
  test('green while the tag leaves no anchor out', () => {
    expect(metric({ ...tag, anchorsExcluded: 0 }, 'anchorSet')).toMatchObject({
      status: Status.SUCCESS,
      text: { key: 'rtlsFleetHealth.value.anchorsClear' },
    });
  });

  test('yellow with how many it leaves out', () => {
    expect(metric(tag, 'anchorSet')).toEqual({
      id: 'anchorSet',
      status: Status.WARNING,
      text: {
        key: 'rtlsFleetHealth.value.anchorsExcluded',
        values: { count: 2 },
      },
    });
  });

  test('red while it follows no survey', () => {
    expect(
      metric(buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'], 'anchorSet')
    ).toMatchObject({
      status: Status.ERROR,
      text: { key: 'rtlsFleetHealth.value.noSurvey' },
    });
  });

  test('unknown while the firmware reports no table', () => {
    expect(metric({ id: '1', solveRateHz: 80 }, 'anchorSet').status).toBe(
      Status.OFF
    );
  });
});

describe('"Survey drift"', () => {
  const drift = (surveyDriftM: number): Status =>
    metric({ ...tag, surveyDriftM }, 'surveyDrift').status;

  test('green under 5 cm, yellow to 10 cm, red above', () => {
    expect(drift(0)).toBe(Status.SUCCESS);
    expect(drift(0.049)).toBe(Status.SUCCESS);
    expect(drift(0.05)).toBe(Status.WARNING);
    expect(drift(0.1)).toBe(Status.WARNING);
    expect(drift(0.101)).toBe(Status.ERROR);
  });

  test('in centimetres', () => {
    expect(metric(tag, 'surveyDrift').text).toEqual({
      key: 'rtlsFleetHealth.value.surveyDrift',
      values: { drift: '3.1' },
    });
  });

  test('unknown for a tag that positions on nothing', () => {
    expect(
      metric(buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'], 'surveyDrift')
        .status
    ).toBe(Status.OFF);
    expect(metric({ id: '1', solveRateHz: 80 }, 'surveyDrift').status).toBe(
      Status.OFF
    );
  });
});

describe('the anchors of the NLOS and outvoted masks', () => {
  test("are named through the tag's own table", () => {
    // bit 1 is the tag's row 1, which is A0 here: slot 1 would be A1
    expect(metric(tag, 'nlosAnchors')).toEqual({
      id: 'nlosAnchors',
      status: Status.WARNING,
      text: { key: 'rtlsFleetHealth.value.anchors', values: { anchors: 'A0' } },
    });
    expect(
      metric({ ...tag, outvotedMask: 3 }, 'outvotedAnchors').text.values
    ).toEqual({ anchors: 'A1, A0' });
  });

  test('a row the table does not name is shown as its row', () => {
    expect(
      metric({ ...tag, nlosMask: 0b1000 }, 'nlosAnchors').text.values
    ).toEqual({ anchors: 'row 3' });
    expect(
      describeFleetHealth({ id: '1', nlosMask: 1 }).find(
        ({ id }) => id === 'nlosAnchors'
      )?.text.values
    ).toEqual({ anchors: 'row 0' });
  });
});

describe('the zone of a drone', () => {
  test('a tag with no survey in use is red', () => {
    const noSurvey = buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'];
    expect(getWorstFleetHealthMetric(describeFleetHealth(noSurvey))?.id).toBe(
      'anchorSet'
    );
    expect(summarizeFleetHealth([noSurvey])).toMatchObject({
      status: Status.ERROR,
    });
  });
});
