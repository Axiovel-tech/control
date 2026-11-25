import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in survey-actions.test.ts.
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
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  isShowAuthorizedToStartLocally: (state: {
    show: { start: { authorized: boolean } };
  }): boolean => state.show.start.authorized,
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  isConnected: (): boolean => false,
}));
// the panel's commit button as last rendered
let mockCommit: () => void = () => undefined;
jest.mock('~/views/rtls/survey/SurveyCommit', () => {
  const actual = jest.requireActual<{
    default: ComponentType<{ onCommit: () => void }>;
  }>('~/views/rtls/survey/SurveyCommit');
  return {
    __esModule: true,
    default: (props: { onCommit: () => void }) => {
      mockCommit = props.onCommit;
      return <actual.default {...props} />;
    },
  };
});
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

import { setRtlsSurveySketch } from '~/features/rtls/survey';
import { commitRtlsSurvey } from '~/features/rtls/survey-actions';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withGroupAdded,
  withXAxis,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';
import RtlsSurveyPanel from '~/views/rtls/RtlsSurveyPanel';
import SurveyCommit from '~/views/rtls/survey/SurveyCommit';

import { reply } from './rtls-test-store';
import { COMMIT, push, READY } from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
  run,
  stateOf,
  surveyOf,
  type SurveyTestStore,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

beforeEach(() => {
  sendMessage.mockReset();
});

const noop = (): void => undefined;

const pageOf = (store: SurveyTestStore) =>
  getRtlsSurveyPage(stateOf(store), CELL);

const setSketch = (store: SurveyTestStore, sketch: RtlsSurveySketch): void => {
  store.dispatch(setRtlsSurveySketch({ cell: CELL, sketch }));
};

/** A store whose cell was laid out with "Standard cell". */
const withStandardCell = (): SurveyTestStore => {
  const store = createSurveyTestStore();
  setSketch(store, standardCellSketch(pageOf(store).anchors));
  return store;
};

/** The recorded fit of the standard cell, as the server echoes it. */
const ready = (revision: number, extra: Record<string, unknown> = {}) =>
  push({ ...READY, frame: { preset: 'two-tiers' }, revision, ...extra });

/** The standard cell surveyed as revision 7, its warnings acknowledged. */
const committable = (): SurveyTestStore => {
  const store = withStandardCell();
  play(store, [ready(7)]);
  acknowledge(store);
  return store;
};

describe('C1. a sketch that cannot be sent is a changed sketch', () => {
  test('the origin chosen as the +x anchor takes Commit away', async () => {
    const store = committable();
    expect(pageOf(store).controls.canCommit).toBe(true);

    setSketch(store, withXAxis(pageOf(store).sketch, '101'));

    const page = pageOf(store);
    expect(page.refitTarget).toBeUndefined();
    expect(page.sketchChanged).toBe(true);
    expect(page.controls.canCommit).toBe(false);
    expect(page.controls.canRefit).toBe(false);

    await run(store, commitRtlsSurvey(CELL, surveyOf(store)));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('and the button says what the sketch lacks', () => {
    const store = committable();
    setSketch(store, withXAxis(pageOf(store).sketch, '101'));
    const page = pageOf(store);
    const markup = renderToStaticMarkup(
      <SurveyCommit
        survey={page.survey!} // non-null: the fit is held
        controls={page.controls}
        offline={[]}
        locked={false}
        nameOf={(id) => id}
        onCommit={noop}
        onLock={noop}
      />
    );
    expect(markup).toContain('rtlsSurvey.problem.sameAnchor');
  });
});

describe('C2. a commit is of the survey the button was rendered with', () => {
  const renderPanel = (store: SurveyTestStore): string =>
    renderToStaticMarkup(
      <Provider store={store}>
        <RtlsSurveyPanel />
      </Provider>
    );
  const OTHER_FIT = { ...(READY.fit as object), rmsM: 0.012 };
  const NO_WARNINGS = { blocked: [], warnings: [] };

  test('a notification between the render and the click does not change it', () => {
    const store = withStandardCell();
    play(store, [ready(7, { gate: NO_WARNINGS })]);
    renderPanel(store);
    const commitAsRendered = mockCommit;
    // another browser's refit: this one never showed it
    play(store, [ready(8, { fit: OTHER_FIT, gate: NO_WARNINGS })]);
    expect(pageOf(store).controls.canCommit).toBe(true);
    sendMessage.mockResolvedValue(reply(COMMIT[2].body));

    commitAsRendered();

    // the server refuses it as stale
    expect(sendMessage.mock.calls.at(-1)?.[0]).toMatchObject({
      action: 'commit',
      revision: 7,
    });
  });

  test('without revisions the replaced fit is not committed at all', async () => {
    const store = withStandardCell();
    play(store, [push({ ...READY, gate: NO_WARNINGS })]);
    const shown = surveyOf(store);
    play(store, [push({ ...READY, fit: OTHER_FIT, gate: NO_WARNINGS })]);
    expect(pageOf(store).controls.canCommit).toBe(true);

    await run(store, commitRtlsSurvey(CELL, shown));

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('C3. a height group of one is no group, on both sides', () => {
  /** A frame as the server echoes it: without its groups of one. */
  const asEchoed = (heightGroups: number[][]): number[][] =>
    heightGroups.filter((group) => group.length > 1);

  test('the standard cell of five anchors is not refitted for ever', () => {
    const store = createSurveyTestStore();
    reportAnchors(store, [...FOUR_ANCHORS, { id: 105, slot: 4 }]);
    setSketch(store, standardCellSketch(pageOf(store).anchors));
    play(store, [
      ready(7, {
        anchors: [101, 102, 103, 104, 105],
        frame: {
          origin: 101,
          xAxis: 102,
          heightGroups: asEchoed([[101, 102, 103, 104], [105]]),
          upper: [105],
          yPositive: 103,
        },
      }),
    ]);
    const page = pageOf(store);
    expect(page.refitTarget?.frame).toEqual({ preset: 'two-tiers' });
    expect(page.sketchChanged).toBe(false);
  });

  test('nor is a group the operator made for one anchor', () => {
    const store = withStandardCell();
    const { sketch } = pageOf(store);
    setSketch(
      store,
      withAnchorGroup(withGroupAdded(sketch, 'Stage'), '104', 2)
    );
    play(store, [ready(7)]);
    expect(pageOf(store).sketchChanged).toBe(true);

    // what the refit sends, as the server echoes it with the new fit
    const { frame, placement } = pageOf(store).refitTarget!; // non-null: valid
    expect(frame).toMatchObject({ heightGroups: [[101, 102, 103], [104]] });
    play(store, [
      ready(8, {
        frame: { ...frame, heightGroups: asEchoed([[101, 102, 103], [104]]) },
        placement,
      }),
    ]);
    expect(pageOf(store).sketchChanged).toBe(false);
  });
});
