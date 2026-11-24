import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// The message hub, the snackbar and the show selectors sit on heavy import
// chains; the store below carries the one show field the guard reads.
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
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  isShowAuthorizedToStartLocally: (state: {
    show: { start: { authorized: boolean } };
  }): boolean => state.show.start.authorized,
}));

import {
  acknowledgeRtlsSurveyWarnings,
  setRtlsSurveySketch,
} from '~/features/rtls/survey';
import {
  cancelRtlsSurvey,
  commitRtlsSurvey,
  queryRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { getRtlsSurveyAnchors } from '~/features/rtls/survey-selectors';
import {
  standardCellSketch,
  withAnchorMoved,
} from '~/features/rtls/survey-sketch';
import { showNotification } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import { UAVAge } from '~/model/uav';

import { reply } from './rtls-test-store';
import {
  COMMIT,
  COMMIT_INCOMPLETE,
  COMMIT_WARNINGS,
  type RecordedMessage,
  REFIT,
  RUN,
  START_REFUSED,
  STATUS_IDLE,
} from './survey-recording';
import {
  CELL,
  createSurveyTestStore as createStore,
  play,
  run,
  stateOf,
  type SurveyTestStore as TestStore,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

const surveyOf = (store: TestStore) => store.getState().rtlsSurvey.survey;

beforeEach(() => {
  sendMessage.mockReset();
});

describe('the requests', () => {
  /** The store with today's standard cell sketched for the four anchors. */
  const withStandardCell = (options?: Parameters<typeof createStore>[0]) => {
    const store = createStore(options);
    store.dispatch(
      setRtlsSurveySketch({
        cell: CELL,
        sketch: standardCellSketch(getRtlsSurveyAnchors(stateOf(store))),
      })
    );
    return store;
  };

  const answerWith = (message: RecordedMessage) =>
    sendMessage.mockResolvedValueOnce(reply(message.body));

  test('the page asks for the survey the server holds', async () => {
    const store = createStore();
    answerWith(STATUS_IDLE);
    await run(store, queryRtlsSurvey());
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'X-RTLS-SURVEY', action: 'status' },
      { timeout: 5 }
    );
    expect(store.getState().rtlsSurvey).toMatchObject({
      available: true,
      survey: { state: 'idle' },
    });
    // asking is not a request the page waits for
    expect(store.getState().rtlsSurvey.pending).toBeUndefined();
  });

  test('a server without the survey is told apart from a failed request', async () => {
    const store = createStore();
    sendMessage.mockRejectedValueOnce(new Error('Unknown message type'));
    await run(store, queryRtlsSurvey());
    expect(store.getState().rtlsSurvey.available).toBe(false);
    expect(store.getState().rtlsSurvey.outcome).toBeUndefined();

    sendMessage.mockRejectedValueOnce(new Error('Timed out'));
    await run(store, cancelRtlsSurvey());
    expect(store.getState().rtlsSurvey).toMatchObject({
      pending: undefined,
      outcome: { action: 'cancel', result: 'error', reason: 'Timed out' },
    });
  });

  test('the standard cell starts as the two-tiers preset, in slot order', async () => {
    const store = withStandardCell();
    answerWith(RUN[0]);
    await run(store, startRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'X-RTLS-SURVEY',
        action: 'start',
        anchors: [101, 102, 103, 104],
        frame: { preset: 'two-tiers' },
      },
      { timeout: 15 }
    );
    expect(surveyOf(store)?.state).toBe('measuring');
  });

  test('a sketch by hand starts with its frame and placement', async () => {
    const store = withStandardCell();
    const sketch = store.getState().rtlsSurvey.sketches[CELL];
    store.dispatch(
      setRtlsSurveySketch({
        cell: CELL,
        sketch: withAnchorMoved(sketch, '104', { north: 4.2, east: 2.8 }),
      })
    );
    answerWith(RUN[0]);
    await run(store, startRtlsSurvey(CELL));
    expect(sendMessage.mock.calls[0][0]).toEqual({
      type: 'X-RTLS-SURVEY',
      action: 'start',
      anchors: [101, 102, 103, 104],
      frame: {
        origin: 101,
        xAxis: 102,
        heightGroups: [[101, 102, 103, 104]],
        upper: [],
        yPositive: 103,
      },
      placement: {
        '101': { x: 0, y: 0 },
        '102': { x: 5, y: 0 },
        '103': { x: 0, y: 5 },
        '104': { x: 4.2, y: 2.8 },
      },
    });
  });

  test('the sketch a fit was made with is remembered; a refused one is not', async () => {
    const store = withStandardCell();
    answerWith(START_REFUSED);
    await run(store, startRtlsSurvey(CELL));
    expect(store.getState().rtlsSurvey.fittedRequest).toBeUndefined();

    answerWith(RUN[0]);
    await run(store, startRtlsSurvey(CELL));
    const started = store.getState().rtlsSurvey.fittedRequest;
    expect(started).toBe(JSON.stringify({ frame: { preset: 'two-tiers' } }));

    // a commit says nothing about the sketch
    play(store, RUN.slice(1));
    answerWith(COMMIT_WARNINGS);
    await run(store, commitRtlsSurvey());
    expect(store.getState().rtlsSurvey.fittedRequest).toBe(started);
  });

  test('Survey sends nothing while the guard refuses or the sketch lacks a frame', async () => {
    await run(withStandardCell({ authorized: true }), startRtlsSurvey(CELL));
    // no sketch: no origin, no +x
    await run(createStore(), startRtlsSurvey(CELL));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('Refit sends the frame and placement, and no anchors', async () => {
    const store = withStandardCell();
    play(store, RUN);
    answerWith(REFIT);
    await run(store, refitRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'X-RTLS-SURVEY',
        action: 'fit',
        frame: { preset: 'two-tiers' },
      },
      { timeout: 15 }
    );
    expect(store.getState().rtlsSurvey).toMatchObject({
      outcome: { action: 'fit', result: 'fitted' },
      // what the fit on screen was made with
      fittedRequest: JSON.stringify({ frame: { preset: 'two-tiers' } }),
    });
  });

  test('Commit carries the acknowledgement only once it was given', async () => {
    const store = withStandardCell();
    play(store, RUN);
    answerWith(COMMIT_WARNINGS);
    await run(store, commitRtlsSurvey());
    expect(sendMessage).toHaveBeenLastCalledWith(
      { type: 'X-RTLS-SURVEY', action: 'commit' },
      { timeout: 30 }
    );
    expect(store.getState().rtls.lockDialogOpen).toBe(false);

    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    answerWith(COMMIT[2]);
    await run(store, commitRtlsSurvey());
    expect(sendMessage).toHaveBeenLastCalledWith(
      { type: 'X-RTLS-SURVEY', action: 'commit', acknowledgeWarnings: true },
      { timeout: 30 }
    );
  });

  test('committed opens the lock dialog; incomplete does not', async () => {
    const store = withStandardCell();
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));

    answerWith(COMMIT_INCOMPLETE);
    await run(store, commitRtlsSurvey());
    expect(store.getState().rtls.lockDialogOpen).toBe(false);
    expect(showNotification).not.toHaveBeenCalled();

    answerWith(COMMIT[2]);
    await run(store, commitRtlsSurvey());
    expect(store.getState().rtls.lockDialogOpen).toBe(true);
    expect(showNotification).toHaveBeenCalledWith(
      'rtlsSurvey.notification.committed'
    );
  });

  test('Commit sends nothing while the guard refuses', async () => {
    const store = withStandardCell({
      uavs: [{ id: '7', age: UAVAge.ACTIVE, errors: [] }],
    });
    play(store, RUN);
    await run(store, commitRtlsSurvey());
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("an answer that is not the survey's is a failed request", async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'No such action' })
    );
    await run(store, cancelRtlsSurvey());
    expect(store.getState().rtlsSurvey.outcome).toEqual({
      action: 'cancel',
      result: 'error',
      reason: 'No such action',
    });
  });
});
