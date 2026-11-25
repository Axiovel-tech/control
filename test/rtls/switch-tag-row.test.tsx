import { describe, expect, jest, test } from '@jest/globals';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

import { buildRtlsStatsMap, mapRtlsAnchors } from '~/features/rtls/handlers';
import { tableAnchorNamer } from '~/features/rtls/survey-health';
import { describeTagDetailLines } from '~/views/rtls/TagRowParts';

import { INFORMATION, STATS, STATS_TAG_NO_SURVEY } from './switch-recording';

/** Echoes the key with its values, as the views' mocked `t` does. */
const t = ((key: string, values?: Record<string, unknown>): string =>
  values === undefined
    ? key
    : `${key}(${Object.entries(values)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`) as Parameters<typeof describeTagDetailLines>[0];

const nameOf = tableAnchorNamer(mapRtlsAnchors(INFORMATION.anchors));
const lineOf = (
  lines: ReturnType<typeof describeTagDetailLines>,
  key: string
) => lines.find((line) => line.key === key);

describe("a tag's detail lines", () => {
  const lines = describeTagDetailLines(
    t,
    buildRtlsStatsMap(STATS.stats)['42'],
    nameOf
  );

  test('the survey line: ID, anchors used, who is out and why, the drift', () => {
    expect(lineOf(lines, 'survey')).toEqual({
      key: 'survey',
      name: 'rtlsSurveyHealth.line.name',
      value: [
        'rtlsSurveyHealth.line.following(id=12,count=2)',
        'rtlsSurveyHealth.line.excluded(anchors=' +
          'rtlsSurveyHealth.line.excludedAnchor(anchor=A2,why=rtlsSurveyHealth.why.noPosition), ' +
          'rtlsSurveyHealth.line.excludedAnchor(anchor=A3,why=rtlsSurveyHealth.why.otherSurvey))',
        'rtlsSurveyHealth.line.drift(drift=3.1)',
      ].join(' · '),
    });
  });

  test('no line of a geometry fit', () => {
    expect(lines.map(({ key }) => key)).toEqual([
      'fixAge',
      'clockDrift',
      'anchorsSeen',
      'survey',
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

  test("the NLOS anchors are those of the tag's own rows", () => {
    expect(lineOf(lines, 'nlosAnchors')?.value).toBe(
      'rtlsFleetHealth.value.anchors(anchors=A0)'
    );
  });

  test('a tag with no survey says so, and how many anchors it hears', () => {
    const none = describeTagDetailLines(
      t,
      buildRtlsStatsMap(STATS_TAG_NO_SURVEY.stats)['42'],
      nameOf
    );
    expect(lineOf(none, 'survey')?.value).toBe(
      [
        'rtlsSurveyHealth.line.none',
        'rtlsSurveyHealth.line.excluded(anchors=' +
          'rtlsSurveyHealth.line.excludedAnchor(anchor=A0,why=rtlsSurveyHealth.why.noPosition), ' +
          'rtlsSurveyHealth.line.excludedAnchor(anchor=0x0009,why=rtlsSurveyHealth.why.noPosition))',
        'rtlsSurveyHealth.line.unnamed(count=2)',
      ].join(' · ')
    );
  });

  test('no survey line from a tag whose firmware reports no table', () => {
    expect(
      lineOf(describeTagDetailLines(t, { id: '1', solveRateHz: 80 }), 'survey')
    ).toBeUndefined();
  });
});
