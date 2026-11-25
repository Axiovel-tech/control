import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in switch-panels.test.tsx.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>): string =>
      values === undefined
        ? key
        : `${key}(${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`,
  }),
}));
jest.mock('~/features/rtls/OverallRtlsStatusLight', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/features/rtls/CellSettingsIcon', () => ({
  __esModule: true,
  default: () => null,
}));
// the health pill's popup and tooltip hang on the document, which a static
// render has none of: the pill itself is what is looked at
jest.mock('~/containerContext', () => ({
  __esModule: true,
  PopoverWithContainerFromContext: () => null,
  TooltipWithContainerFromContext: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));
// a dialog renders into a portal, which a static render leaves out
jest.mock('@mui/material/Dialog', () => ({
  __esModule: true,
  default: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid='dialog'>{children}</div> : null),
}));

import { Status } from '~/components/semantics';
import { describeAnchorBadges } from '~/features/rtls/anchor-utils';
import {
  describeFleetHealth,
  type FleetHealthMetric,
  type FleetHealthMetricId,
  summarizeFleetHealth,
} from '~/features/rtls/fleet-health';
import {
  buildRtlsDeviceStatusMap,
  buildRtlsStatsMap,
  handleRtlsStatsMessage,
  mapRtlsAnchors,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { mapCellSurvey } from '~/features/rtls/handlers-survey';
import RtlsVerifyDialog from '~/features/rtls/RtlsVerifyDialog';
import {
  openRtlsVerifyDialog,
  rtlsVerifySucceeded,
} from '~/features/rtls/slice';
import {
  getAnchorHealth,
  isRangeDeviating,
  isSurveyPlanar,
  isTagPositioned,
  RtlsHealth,
} from '~/features/rtls/stats-utils';
import {
  describeTagSurvey,
  describeTagSurveyChip,
  describeTagSurveyPill,
  tableAnchorNamer,
} from '~/features/rtls/survey-health';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsVerifyRule,
} from '~/features/rtls/types';
import { type AppDispatch } from '~/store/reducers';
import { describeAnchorDetailLines } from '~/views/rtls/AnchorRowParts';
import { RtlsTagsPanel } from '~/views/rtls/RtlsRolePanel';

import { createRtlsTestStore, type RtlsTestStore } from './rtls-test-store';
import { INFORMATION, INFORMATION_CLEAN, STATS } from './switch-recording';

// the recorded messages, mapped as the app maps them
const devices = Object.entries(
  buildRtlsDeviceStatusMap(INFORMATION.status)
).map(([id, device]): RtlsDevice => ({ id, ...device }));
const tag42 = devices.find(({ id }) => id === '42')!; // non-null: recorded
const stats42 = buildRtlsStatsMap(STATS.stats)['42'];
const clean = mapCellSurvey(INFORMATION_CLEAN.survey);
const siteAnchors = mapRtlsAnchors(INFORMATION.anchors);
const nameOf = tableAnchorNamer(siteAnchors);

/** Tag 42 on every anchor of the survey it uses, leaving none out. */
const using = (anchorsUsed: number): RtlsDeviceStats => ({
  ...stats42,
  anchorsUsed,
  anchorsExcluded: 0,
});

/** The cell of the recording: on survey 12, its anchors at two heights. */
const CELL = { surveyId: 12, planar: false };
/** The same with every anchor of the survey at one height. */
const PLANAR = { surveyId: 12, planar: true };

const metric = (
  stats: RtlsDeviceStats,
  id: FleetHealthMetricId,
  cell = CELL
): FleetHealthMetric =>
  describeFleetHealth(stats, undefined, cell).find((entry) => entry.id === id)!; // non-null: every metric is listed

/** The recorded anchors with every surveyed one declared planar, or not. */
const information = (planar: boolean, tagStats: Record<string, unknown>) => ({
  information: {
    ...INFORMATION_CLEAN,
    anchors: INFORMATION.anchors.map((anchor) => ({
      ...anchor,
      planar: anchor.surveyId === null ? false : planar,
    })),
  },
  stats: {
    ...STATS,
    stats: { ...STATS.stats, '42': { ...STATS.stats['42'], ...tagStats } },
  },
});

const tagsPanel = (messages: ReturnType<typeof information>): string => {
  const store = createRtlsTestStore();
  for (const action of rtlsInformationActions(messages.information)) {
    store.dispatch(action);
  }
  handleRtlsStatsMessage(messages.stats, store.dispatch as AppDispatch);
  return renderToStaticMarkup(
    <Provider store={store}>
      <RtlsTagsPanel />
    </Provider>
  );
};

/** The element with the given test id, tags included. */
const element = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="${id}"`);
  return start < 0
    ? ''
    : markup.slice(markup.lastIndexOf('<', start), markup.indexOf('</', start));
};

describe('3. a tag is positioned on four anchors, or on three planar ones', () => {
  test('four anchors of its survey are enough; three are not', () => {
    expect(isTagPositioned(using(4), CELL)).toBe(true);
    expect(isTagPositioned(using(8), CELL)).toBe(true);
    expect(isTagPositioned(using(3), CELL)).toBe(false);
    expect(isTagPositioned(using(1), CELL)).toBe(false);
    // and none without a survey ID, however many it hears
    expect(isTagPositioned({ ...using(8), surveyId: undefined }, CELL)).toBe(
      false
    );
  });

  test('three are, when every surveyed anchor is planar', () => {
    expect(isTagPositioned(using(3), PLANAR)).toBe(true);
    expect(isTagPositioned(using(2), PLANAR)).toBe(false);
  });

  test('a survey is planar when every anchor that advertises it says so', () => {
    const anchors = devices.filter(({ role }) => role !== 'tag');
    const statsById = buildRtlsStatsMap(STATS.stats);
    const planarSurvey = (
      site: typeof siteAnchors,
      online = anchors,
      stats = statsById
    ): boolean => isSurveyPlanar(12, online, stats, site);
    const planar = siteAnchors.map((anchor) => ({ ...anchor, planar: true }));
    expect(planarSurvey(siteAnchors)).toBe(false);
    expect(planarSurvey(planar)).toBe(true);
    // 203 is not surveyed and 204 is on survey 11: they have no say
    const but = (systemId: number) =>
      planar.map((anchor) =>
        anchor.systemId === systemId ? { ...anchor, planar: false } : anchor
      );
    expect(planarSurvey(but(203))).toBe(true);
    expect(planarSurvey(but(204))).toBe(true);
    // one anchor of the survey that is not planar is enough
    expect(planarSurvey(but(206))).toBe(false);
    // unless it is offline, or its telemetry stopped
    expect(
      planarSurvey(
        but(206),
        anchors.map((anchor) =>
          anchor.id === '206' ? { ...anchor, online: false } : anchor
        )
      )
    ).toBe(true);
    expect(
      planarSurvey(but(206), anchors, {
        ...statsById,
        '206': { ...statsById['206'], stale: true },
      })
    ).toBe(true);
    expect(planarSurvey(planar, [])).toBe(false);
    expect(isSurveyPlanar(undefined, anchors, statsById, planar)).toBe(false);
  });

  test('the row pill: three anchors of its survey are too few, and say so', () => {
    expect(describeTagSurveyChip(tag42, using(3), CELL)).toEqual({
      status: Status.ERROR,
      text: {
        key: 'rtlsSurveyHealth.tag.tooFew',
        values: { id: 12, count: 3 },
      },
    });
    expect(describeTagSurveyChip(tag42, using(3), PLANAR)).toMatchObject({
      status: Status.SUCCESS,
    });
    expect(describeTagSurveyChip(tag42, using(4), CELL)).toMatchObject({
      status: Status.SUCCESS,
    });
  });

  test('the tags header counts such a tag as not positioned', () => {
    expect(describeTagSurveyPill(clean, [tag42], { '42': using(3) })).toEqual({
      status: Status.ERROR,
      text: { key: 'rtlsSurveyHealth.tags.off', values: { count: 1, id: 12 } },
    });
    expect(
      describeTagSurveyPill(clean, [tag42], { '42': using(3) }, true)
    ).toMatchObject({ status: Status.SUCCESS });
  });

  test('pre-show health: "Anchor set" is red and the drift is not graded', () => {
    expect(metric(using(3), 'anchorSet')).toEqual({
      id: 'anchorSet',
      status: Status.ERROR,
      text: {
        key: 'rtlsFleetHealth.value.tooFewAnchors',
        values: { count: 3 },
      },
    });
    expect(metric(using(3), 'surveyDrift').status).toBe(Status.OFF);
    expect(summarizeFleetHealth([using(3)], CELL).status).toBe(Status.ERROR);

    expect(metric(using(3), 'anchorSet', PLANAR).status).toBe(Status.SUCCESS);
    expect(metric(using(3), 'surveyDrift', PLANAR).status).toBe(Status.SUCCESS);
    expect(summarizeFleetHealth([using(3)], PLANAR).status).not.toBe(
      Status.ERROR
    );
  });

  test('the survey line keeps the facts and claims no drift', () => {
    const line = describeTagSurvey(using(3), nameOf, CELL);
    expect(line?.following).toEqual({
      key: 'rtlsSurveyHealth.line.following',
      values: { id: 12, count: 3 },
    });
    expect(line?.drift).toBeUndefined();
    expect(describeTagSurvey(using(3), nameOf, PLANAR)?.drift).toBeDefined();
  });

  test('on the panel the header, the row and the health line agree', () => {
    const few = tagsPanel(
      information(false, { anchorsUsed: 3, anchorsExcluded: 0 })
    );
    expect(element(few, 'rtls-tags-panel.survey')).toContain(
      'rtlsSurveyHealth.tags.off(count=1,id=12)'
    );
    expect(element(few, 'rtls-row-survey')).toContain(
      'rtlsSurveyHealth.tag.tooFew(id=12,count=3)'
    );
    expect(element(few, 'rtls-tags-panel.health')).toContain(
      'StatusPill-status-error'
    );

    // the same three anchors of a planar survey
    const planar = tagsPanel(
      information(true, { anchorsUsed: 3, anchorsExcluded: 0 })
    );
    expect(element(planar, 'rtls-tags-panel.survey')).toContain(
      'rtlsSurveyHealth.tags.ok(id=12)'
    );
    expect(element(planar, 'rtls-row-survey')).toContain(
      'rtlsSurveyHealth.tag.ok(id=12,count=3)'
    );
    expect(element(planar, 'rtls-tags-panel.health')).not.toContain(
      'StatusPill-status-error'
    );
  });
});

describe('8. the tags header is not green on a tag that reports nothing', () => {
  const noTelemetry = (count: number) => ({
    status: Status.ERROR,
    text: { key: 'rtlsSurveyHealth.tags.noTelemetry', values: { count } },
  });
  const pill = (tag: RtlsDevice, stats: RtlsDeviceStats | undefined) =>
    describeTagSurveyPill(clean, [tag], { [tag.id]: stats });

  test('green while the awake tag reports', () => {
    expect(pill(tag42, using(4))).toMatchObject({ status: Status.SUCCESS });
  });

  test('a tag whose telemetry stopped counts against it', () => {
    expect(pill(tag42, { ...using(4), stale: true })).toEqual(noTelemetry(1));
    expect(pill(tag42, undefined)).toEqual(noTelemetry(1));
  });

  test('so does a tag that reports no table at all', () => {
    expect(pill(tag42, { id: '42', solveRateHz: 80 })).toEqual(noTelemetry(1));
  });

  test('and a tag that was awake when it was lost', () => {
    expect(pill({ ...tag42, online: false }, using(4))).toEqual(noTelemetry(1));
    // one whose sleep state the server does not know is not known asleep
    expect(
      pill({ ...tag42, online: false, sleeping: undefined }, using(4))
    ).toEqual(noTelemetry(1));
  });

  test('a sleeping tag owes none, online or lost', () => {
    expect(pill({ ...tag42, sleeping: true }, undefined)).toMatchObject({
      status: Status.SUCCESS,
    });
    expect(
      pill({ ...tag42, online: false, sleeping: true }, using(4))
    ).toMatchObject({ status: Status.SUCCESS });
    expect(pill({ ...tag42, role: 'disabled' }, undefined)).toMatchObject({
      status: Status.SUCCESS,
    });
  });

  test('the tags that do not report are counted', () => {
    const other = { ...tag42, id: '44' };
    expect(
      describeTagSurveyPill(clean, [tag42, other, { ...tag42, id: '45' }], {
        '42': using(4),
        '44': { ...using(4), id: '44', stale: true },
      })
    ).toEqual(noTelemetry(2));
  });

  test('on the panel', () => {
    const header = element(
      tagsPanel(information(false, { stale: true })),
      'rtls-tags-panel.survey'
    );
    expect(header).toContain('StatusPill-status-error');
    expect(header).toContain('rtlsSurveyHealth.tags.noTelemetry(count=1)');
  });
});

describe('9. pre-show "Anchor set" with an unknown count of anchors left out', () => {
  test('is unknown, not green', () => {
    expect(
      metric({ ...using(4), anchorsExcluded: undefined }, 'anchorSet')
    ).toEqual({
      id: 'anchorSet',
      status: Status.OFF,
      text: { key: 'rtlsFleetHealth.value.unknown' },
    });
  });

  test('zero is none, and green', () => {
    expect(metric(using(4), 'anchorSet')).toMatchObject({
      status: Status.SUCCESS,
      text: { key: 'rtlsFleetHealth.value.anchorsClear' },
    });
  });
});

describe('10. a Verify rule without a detail', () => {
  const render = (rule: Partial<RtlsVerifyRule>): string => {
    const store: RtlsTestStore = createRtlsTestStore();
    store.dispatch(
      rtlsVerifySucceeded({
        inDepth: false,
        passed: false,
        receivedAt: 0,
        rules: [
          {
            id: 'survey',
            label: 'Anchor survey',
            severity: 'error',
            status: 'fail',
            ...rule,
          },
        ],
      })
    );
    store.dispatch(openRtlsVerifyDialog());
    return renderToStaticMarkup(
      <Provider store={store}>
        <RtlsVerifyDialog />
      </Provider>
    );
  };
  const findings = (markup: string): string[] =>
    [...markup.matchAll(/<span style="display:block">([^<]*)</g)].map(
      (match) => match[1]
    );

  test('is rendered with no detail lines', () => {
    const markup = render({});
    expect(markup).toContain('data-testid="rtls-verify-rule-survey"');
    expect(markup).toContain('Anchor survey');
    expect(markup).toContain('StatusLight-status-error');
    expect(findings(markup)).toEqual([]);
  });

  test('also when the server sends null for it', () => {
    // as it travels: the body is not typed
    const markup = render({ detail: null as unknown as undefined });
    expect(markup).toContain('data-testid="rtls-verify-rule-survey"');
    expect(findings(markup)).toEqual([]);
  });

  test('a detail is still one finding per line', () => {
    expect(
      findings(render({ detail: 'A2 is not surveyed; tag 42 lost' }))
    ).toEqual(['A2 is not surveyed', 'tag 42 lost']);
  });
});

describe("11. an anchor's range check on the value as the anchor reported it", () => {
  /** An anchor's stats as mapped from the wire, with the given reading. */
  const reading = (rangeDeviationM: number): RtlsDeviceStats =>
    buildRtlsStatsMap({
      '202': { powerState: 'operating', rangingRateHz: 83, rangeDeviationM },
    })['202'];
  /** Echoes the key with its values, as the views' mocked `t` does. */
  const t = ((key: string, values?: Record<string, unknown>): string =>
    values === undefined
      ? key
      : `${key}(${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(',')})`) as Parameters<typeof describeAnchorDetailLines>[0];

  test('the value is kept as it came, not rounded', () => {
    expect(reading(0.08004).rangeDeviationM).toBe(0.08004);
    expect(reading(-0.123456789).rangeDeviationM).toBe(-0.123456789);
  });

  test('8.004 cm warns, as on the anchor; 8 cm does not', () => {
    expect(isRangeDeviating(reading(0.08004))).toBe(true);
    expect(isRangeDeviating(reading(-0.08004))).toBe(true);
    expect(isRangeDeviating(reading(0.08))).toBe(false);
    expect(isRangeDeviating(reading(0.07996))).toBe(false);
    expect(getAnchorHealth({ online: true, age: 1 }, reading(0.08004))).toBe(
      RtlsHealth.WARNING
    );
  });

  test('the badge shows whole centimetres', () => {
    expect(describeAnchorBadges(reading(0.08004))[0].text).toEqual({
      key: 'rtlsAnchor.badge.rangeFarther',
      values: { cm: 8 },
    });
    expect(describeAnchorBadges(reading(-0.123456789))[0].text).toEqual({
      key: 'rtlsAnchor.badge.rangeCloser',
      values: { cm: 12 },
    });
  });

  test('the detail line shows one decimal: no long float reaches the screen', () => {
    const line = (rangeDeviationM: number): string | undefined => {
      const found = describeAnchorDetailLines(
        t,
        reading(rangeDeviationM),
        undefined
      ).find(({ key }) => key === 'survey');
      return typeof found?.value === 'string' ? found.value : undefined;
    };
    expect(line(0.08004)).toBe('rtlsAnchor.value.rangeDeviation(cm=8.0)');
    expect(line(-0.123456789)).toBe(
      'rtlsAnchor.value.rangeDeviation(cm=-12.3)'
    );
    expect(line(0.0041999999999)).toBe(
      'rtlsAnchor.value.rangeDeviation(cm=0.4)'
    );
  });
});
