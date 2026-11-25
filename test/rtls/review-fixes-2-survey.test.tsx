import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

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
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

import { setRtlsSurveySketch } from '~/features/rtls/survey';
import { commitRtlsSurvey } from '~/features/rtls/survey-actions';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveySketch,
  standardCellSketch,
  withXAxis,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';
import SurveyCommit from '~/views/rtls/survey/SurveyCommit';

import { push, READY } from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore,
  play,
  run,
  stateOf,
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

    await run(store, commitRtlsSurvey(CELL));
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
