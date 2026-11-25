import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in review-fixes-health.test.tsx.
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
jest.mock('~/containerContext', () => ({
  __esModule: true,
  PopoverWithContainerFromContext: () => null,
  TooltipWithContainerFromContext: ({
    children,
  }: {
    children: React.ReactNode;
  }) => children,
}));

import {
  handleRtlsStatsMessage,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { type AppDispatch } from '~/store/reducers';
import { RtlsTagsPanel } from '~/views/rtls/RtlsRolePanel';

import { createRtlsTestStore } from './rtls-test-store';
import { INFORMATION_CLEAN, STATS } from './switch-recording';

/** What the panel says of tag 42: its header, row chip and health pill. */
const shown = (
  information: Record<string, unknown>,
  tagStats: Record<string, unknown>,
  anchorStats: Record<string, Record<string, unknown>> = {}
) => {
  const store = createRtlsTestStore();
  for (const action of rtlsInformationActions({
    ...INFORMATION_CLEAN,
    ...information,
  })) {
    store.dispatch(action);
  }
  handleRtlsStatsMessage(
    {
      ...STATS,
      stats: {
        ...STATS.stats,
        ...anchorStats,
        '42': { ...STATS.stats['42'], ...tagStats },
      },
    },
    store.dispatch as AppDispatch
  );
  const markup = renderToStaticMarkup(
    <Provider store={store}>
      <RtlsTagsPanel />
    </Provider>
  );
  const element = (id: string): string => {
    const start = markup.indexOf(`data-testid="${id}"`);
    return start < 0
      ? ''
      : markup.slice(
          markup.lastIndexOf('<', start),
          markup.indexOf('</', start)
        );
  };
  return {
    header: element('rtls-tags-panel.survey'),
    chip: element('rtls-row-survey'),
    health: element('rtls-tags-panel.health'),
  };
};

describe('C7. planar is said of the anchors that advertise the cell survey now', () => {
  /** 201, 202 and 205 planar on survey 12; 206 lost, still on survey 11. */
  const threePlanar = {
    status: {
      ...INFORMATION_CLEAN.status,
      '206': { ...INFORMATION_CLEAN.status['206'], online: false },
    },
    anchors: INFORMATION_CLEAN.anchors
      .filter(({ systemId }) => [201, 202, 205, 206].includes(systemId))
      .map((anchor) =>
        anchor.systemId === 206
          ? { ...anchor, surveyId: 11, planar: false, active: false }
          : { ...anchor, planar: true }
      ),
  };
  const usingThree = { anchorsUsed: 3, anchorsExcluded: 0 };

  test('a lost anchor of an older survey has no say', () => {
    const { chip, header, health } = shown(threePlanar, usingThree);
    expect(header).toContain('rtlsSurveyHealth.tags.ok(id=12)');
    expect(chip).toContain('rtlsSurveyHealth.tag.ok(id=12,count=3)');
    expect(health).not.toContain('StatusPill-status-error');
  });

  test('an anchor of the survey that is not planar has', () => {
    const mixed = {
      anchors: threePlanar.anchors.map((anchor) =>
        anchor.systemId === 205 ? { ...anchor, planar: false } : anchor
      ),
    };
    expect(shown({ ...threePlanar, ...mixed }, usingThree).chip).toContain(
      'rtlsSurveyHealth.tag.tooFew(id=12,count=3)'
    );
  });
});
