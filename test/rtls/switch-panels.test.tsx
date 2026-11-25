import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in the other RTLS view tests.
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
// the panels' own controls are not what is looked at here
jest.mock('~/features/rtls/AnchorLockControl', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/features/rtls/CellSettingsControl', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/features/rtls/CellSettingsIcon', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/features/rtls/OverallRtlsStatusLight', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('~/views/rtls/FleetHealthSummary', () => ({
  __esModule: true,
  default: () => null,
}));

import { rtlsInformationActions } from '~/features/rtls/handlers';
import { handleRtlsStatsMessage } from '~/features/rtls/handlers';
import { type AppDispatch } from '~/store/reducers';
import { RtlsAnchorsPanel, RtlsTagsPanel } from '~/views/rtls/RtlsRolePanel';

import { createRtlsTestStore, type RtlsTestStore } from './rtls-test-store';
import {
  INFORMATION,
  INFORMATION_BLANK,
  INFORMATION_CLEAN,
  STATS,
} from './switch-recording';

/** A store that received the recorded messages, as the hub delivers them. */
const storeWith = (
  information: Record<string, unknown> = INFORMATION
): RtlsTestStore => {
  const store = createRtlsTestStore();
  for (const action of rtlsInformationActions(information)) {
    store.dispatch(action);
  }
  handleRtlsStatsMessage(STATS, store.dispatch as AppDispatch);
  return store;
};

const render = (store: RtlsTestStore, panel: React.ReactNode): string =>
  renderToStaticMarkup(<Provider store={store}>{panel}</Provider>);

/** The element with the given test id, tags included. */
const element = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="${id}"`);
  return start < 0
    ? ''
    : markup.slice(markup.lastIndexOf('<', start), markup.indexOf('</', start));
};

/** The markup of one device row. */
const row = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="rtls-device-${id}"`);
  const next = markup.indexOf('data-testid="rtls-device-', start + 1);
  return markup.slice(start, next < 0 ? undefined : next);
};

describe('the anchors panel', () => {
  test('header pill: the survey, its anchors, amber with anchors out', () => {
    const pill = element(
      render(storeWith(), <RtlsAnchorsPanel />),
      'rtls-anchors-panel.survey'
    );
    expect(pill).toContain('StatusPill-status-warning');
    expect(pill).toContain('rtlsSurveyHealth.cell.out(id=12,count=2,out=2)');
  });

  test('header pill: green with every anchor on the survey, red with none', () => {
    const clean = element(
      render(storeWith(INFORMATION_CLEAN), <RtlsAnchorsPanel />),
      'rtls-anchors-panel.survey'
    );
    expect(clean).toContain('StatusPill-status-success');
    expect(clean).toContain('rtlsSurveyHealth.cell.ok(id=12,count=4,out=0)');
    const blank = element(
      render(storeWith(INFORMATION_BLANK), <RtlsAnchorsPanel />),
      'rtls-anchors-panel.survey'
    );
    expect(blank).toContain('StatusPill-status-error');
    expect(blank).toContain('rtlsSurveyHealth.cell.none');
  });

  test('a survey chip per row', () => {
    const markup = render(storeWith(), <RtlsAnchorsPanel />);
    expect(row(markup, '201')).toContain(
      'rtlsSurveyHealth.anchor.survey(id=12)'
    );
    expect(row(markup, '203')).toContain('rtlsSurveyHealth.anchor.notSurveyed');
    expect(row(markup, '204')).toContain(
      'rtlsSurveyHealth.anchor.otherSurveyId(id=11)'
    );
    expect(element(row(markup, '204'), 'rtls-row-survey')).toContain(
      'StatusPill-status-warning'
    );
  });

  test('the range badge on the anchor whose range check warns, only', () => {
    const markup = render(storeWith(), <RtlsAnchorsPanel />);
    expect(row(markup, '202')).toContain(
      'data-testid="rtls-anchor-badge-rangeDeviation"'
    );
    expect(row(markup, '202')).toContain('rtlsAnchor.badge.rangeCloser(cm=12)');
    expect(row(markup, '204')).not.toContain(
      'rtls-anchor-badge-rangeDeviation'
    );
  });

  test('no survey state from a server that reports none', () => {
    const { survey: _survey, ...older } = INFORMATION;
    const markup = render(storeWith(older), <RtlsAnchorsPanel />);
    expect(markup).not.toContain('rtls-anchors-panel.survey');
    expect(markup).not.toContain('rtls-row-survey');
  });
});

describe('the tags panel', () => {
  test('header pill: amber with the tags that leave an anchor out', () => {
    const pill = element(
      render(storeWith(), <RtlsTagsPanel />),
      'rtls-tags-panel.survey'
    );
    expect(pill).toContain('StatusPill-status-warning');
    expect(pill).toContain('rtlsSurveyHealth.tags.excluding(count=1)');
  });

  test('header pill: red with no survey', () => {
    const pill = element(
      render(storeWith(INFORMATION_BLANK), <RtlsTagsPanel />),
      'rtls-tags-panel.survey'
    );
    expect(pill).toContain('StatusPill-status-error');
    expect(pill).toContain('rtlsSurveyHealth.tags.none');
  });

  test("a tag's row: its survey, the anchors it uses and how many are out", () => {
    const markup = render(storeWith(), <RtlsTagsPanel />);
    expect(element(row(markup, '42'), 'rtls-row-survey')).toContain(
      'rtlsSurveyHealth.tag.excluding(id=12,count=2,excluded=2)'
    );
    // a sleeping tag reports no table
    expect(row(markup, '43')).not.toContain('rtls-row-survey');
  });

  test('the anchor bars are named by the rows of the tag, not by slot', () => {
    const tag = row(render(storeWith(), <RtlsTagsPanel />), '42');
    expect(tag).toContain('title="A1: present"');
    expect(tag).toContain('title="A0: present"');
    expect(tag).not.toContain('title="Anchor');
  });

  test('neither a geometry pill nor its check and Recalibrate buttons', () => {
    const markup = render(storeWith(), <RtlsTagsPanel />);
    expect(markup).not.toMatch(/geometry/i);
    expect(markup).not.toMatch(/recalibrat/i);
    expect(markup).toContain('data-testid="rtls-tags-panel.verify"');
  });
});
