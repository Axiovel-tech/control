import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in survey.test.ts; the page asks
// for the survey only while connected, which this render is not.
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

import {
  buildRtlsDeviceStatusMap,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import { setRtlsDevicesFromStatus } from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  setRtlsSurveySketch,
} from '~/features/rtls/survey';
import { startRtlsSurvey } from '~/features/rtls/survey-actions';
import { getRtlsSurveyAnchors } from '~/features/rtls/survey-selectors';
import {
  standardCellSketch,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';
import RtlsSurveyPanel from '~/views/rtls/RtlsSurveyPanel';

import { reply } from './rtls-test-store';

import { RUN, RUN_BLOCKED, STATUS_IDLE } from './survey-recording';
import {
  CELL,
  createSurveyTestStore,
  information,
  play,
  run,
  stateOf,
  type SurveyTestStore,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

const render = (store: SurveyTestStore): string =>
  renderToStaticMarkup(
    <Provider store={store}>
      <RtlsSurveyPanel />
    </Provider>
  );

/** The opening tag of the element with the given test id. */
const tagOf = (markup: string, id: string): string => {
  const at = markup.indexOf(`data-testid="${id}"`);
  return at < 0
    ? ''
    : markup.slice(markup.lastIndexOf('<', at), markup.indexOf('>', at) + 1);
};

const withStandardCell = (
  options?: Parameters<typeof createSurveyTestStore>[0]
): SurveyTestStore => {
  const store = createSurveyTestStore(options);
  store.dispatch(
    setRtlsSurveySketch({
      cell: CELL,
      sketch: standardCellSketch(getRtlsSurveyAnchors(stateOf(store))),
    })
  );
  return store;
};

describe('the survey panel', () => {
  test('without an online anchor there is nothing to survey', () => {
    const store = createSurveyTestStore();
    store.dispatch(setRtlsDevicesFromStatus(buildRtlsDeviceStatusMap({})));
    const markup = render(store);
    expect(markup).toContain('rtlsSurvey.noAnchors.header');
    expect(markup).not.toContain('rtls-survey-panel');
  });

  test('before a sketch: every anchor on the plan and in the list, and what Survey lacks', () => {
    const store = createSurveyTestStore();
    play(store, [STATUS_IDLE]);
    const markup = render(store);
    expect(tagOf(markup, 'rtls-survey-panel')).toContain('data-state="idle"');
    for (const id of ['101', '102', '103', '104']) {
      expect(markup).toContain(`data-testid="rtls-survey-anchor-${id}"`);
      expect(markup).toContain(`data-testid="rtls-survey-row-${id}"`);
    }
    // the three that store a position start there; the fourth waits
    expect(markup.split('data-known="true"')).toHaveLength(4);
    expect(markup).toContain('RTLS anchor A3');
    expect(tagOf(markup, 'rtls-survey-start')).toContain('disabled');
    expect(markup).toContain('rtlsSurvey.problem.pickOrigin');
    expect(markup).not.toContain('rtls-survey-commit');
  });

  test('the standard cell makes Survey available', () => {
    const store = withStandardCell();
    play(store, [STATUS_IDLE]);
    const markup = render(store);
    expect(markup).toContain('rtls-survey-standard-on');
    expect(tagOf(markup, 'rtls-survey-start')).not.toContain('disabled');
    expect(markup).not.toContain('rtls-survey-start-blocked');
  });

  test('a server without the survey says so', () => {
    const markup = render(withStandardCell());
    // not connected here, so nothing was asked and nothing is known
    expect(tagOf(markup, 'rtls-survey-start')).not.toContain('disabled');
    const store = withStandardCell();
    store.dispatch({
      type: 'rtlsSurvey/rtlsSurveyRequestFailed',
      payload: { action: 'status', reason: 'Unknown message type' },
    });
    expect(render(store)).toContain('rtlsSurvey.refusal.noServer');
  });

  test('a fit: the result, the gate and the commit, opened by the acknowledgement', () => {
    const store = withStandardCell();
    play(store, RUN);
    const waiting = render(store);
    expect(tagOf(waiting, 'rtls-survey-panel')).toContain('data-state="ready"');
    expect(waiting).toContain('rtls-survey-fitted-103');
    expect(waiting).toContain('data-testid="rtls-survey-pairs"');
    expect(waiting).toContain('data-testid="rtls-survey-warnings"');
    expect(tagOf(waiting, 'rtls-survey-commit')).toContain('disabled');
    expect(waiting).toContain('rtlsSurvey.commit.acknowledgeFirst');

    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    expect(tagOf(render(store), 'rtls-survey-commit')).not.toContain(
      'disabled'
    );
  });

  test('a sketch moved on since the fit asks for a refit', async () => {
    const store = withStandardCell();
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    play(store, RUN.slice(1));
    expect(render(store)).not.toContain('rtlsSurvey.run.sketchChanged');

    store.dispatch(
      setRtlsSurveySketch({
        cell: CELL,
        sketch: withAnchorMoved(
          store.getState().rtlsSurvey.sketches[CELL],
          '104',
          { north: 4, east: 3 }
        ),
      })
    );
    expect(render(store)).toContain('rtlsSurvey.run.sketchChanged');
  });

  test('locked anchors disable Survey and Commit, with the reason shown', () => {
    const store = withStandardCell();
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    for (const action of rtlsInformationActions(information(4))) {
      store.dispatch(action);
    }
    const markup = render(store);
    expect(tagOf(markup, 'rtls-survey-start')).toContain('disabled');
    expect(tagOf(markup, 'rtls-survey-commit')).toContain('disabled');
    expect(markup.split('rtlsCellSettings.unlockFirst')).toHaveLength(3);
    // a refit writes nothing to an anchor
    expect(tagOf(markup, 'rtls-survey-refit')).not.toContain('disabled');
  });

  test('an authorized show and a drone that may be armed do the same', () => {
    const authorized = withStandardCell({ authorized: true });
    play(authorized, RUN);
    expect(render(authorized)).toContain('rtlsSurvey.refusal.showAuthorized');
    expect(tagOf(render(authorized), 'rtls-survey-start')).toContain(
      'disabled'
    );

    const armed = withStandardCell({ uavs: [{ id: '7', errors: [] }] });
    play(armed, RUN);
    expect(render(armed)).toContain('rtlsCellSettings.disarmFirst');
    expect(tagOf(render(armed), 'rtls-survey-commit')).toContain('disabled');
  });

  test('a blocked fit shows the blocks and no acknowledgement', () => {
    const store = withStandardCell();
    play(store, RUN_BLOCKED);
    const markup = render(store);
    expect(markup).toContain('data-testid="rtls-survey-blocked"');
    expect(markup).not.toContain('rtls-survey-acknowledge');
    expect(tagOf(markup, 'rtls-survey-commit')).toContain('disabled');
    expect(markup).toContain('rtlsSurvey.commit.blocked');
  });
});
