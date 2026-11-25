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
  rtlsSurveyRequested,
  setRtlsSurveySketch,
  statusQueryDelayMs,
} from '~/features/rtls/survey';
import {
  cancelRtlsSurvey,
  commitRtlsSurvey,
  queryRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { PLAN_AS_FRAME } from '~/features/rtls/survey-frame';
import {
  getRtlsSurveyAnchors,
  getRtlsSurveyPage,
} from '~/features/rtls/survey-selectors';
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
  push,
  READY,
  type RecordedMessage,
  REFIT,
  RUN,
  RUN_BLOCKED,
  START_REFUSED,
  STATUS_IDLE,
} from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore as createStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
  run,
  stateOf,
  type SurveyTestStore as TestStore,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

const surveyOf = (store: TestStore) => store.getState().rtlsSurvey.survey;

const pageOf = (store: TestStore) => getRtlsSurveyPage(stateOf(store), CELL);

/** The warnings of the recorded fit, as they travel. */
const READY_WARNINGS = (READY.gate as { warnings: unknown[] }).warnings;

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

  test('a server without the survey answers so, and is not asked again', async () => {
    const store = createStore();
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'Unknown message type' })
    );
    await run(store, queryRtlsSurvey());
    expect(store.getState().rtlsSurvey).toMatchObject({ available: false });
    expect(store.getState().rtlsSurvey.statusFailures).toBeUndefined();
    expect(store.getState().rtlsSurvey.outcome).toBeUndefined();
  });

  test('a status request that times out says nothing about the server, and is tried again', async () => {
    const store = withStandardCell();
    sendMessage.mockRejectedValueOnce(new Error('Timed out'));
    await run(store, queryRtlsSurvey());
    expect(store.getState().rtlsSurvey.available).toBeUndefined();
    expect(store.getState().rtlsSurvey.statusFailures).toBe(1);
    // Survey is not held back by a request that got lost
    expect(pageOf(store).controls).toMatchObject({
      canStart: true,
      startBlockedKey: undefined,
    });
    // the page asks at once when it opens, and waits before it asks again
    expect(statusQueryDelayMs(undefined)).toBe(0);
    expect(statusQueryDelayMs(1)).toBe(5000);

    sendMessage.mockRejectedValueOnce(new Error('Timed out'));
    await run(store, queryRtlsSurvey());
    expect(store.getState().rtlsSurvey.statusFailures).toBe(2);

    answerWith(STATUS_IDLE);
    await run(store, queryRtlsSurvey());
    expect(store.getState().rtlsSurvey.available).toBe(true);
  });

  test('another request that times out is a failed request', async () => {
    const store = withStandardCell();
    play(store, RUN.slice(0, 1));
    sendMessage.mockRejectedValueOnce(new Error('Timed out'));
    await run(store, cancelRtlsSurvey(CELL));
    expect(store.getState().rtlsSurvey).toMatchObject({
      pending: undefined,
      outcome: { action: 'cancel', result: 'error', reason: 'Timed out' },
    });
    expect(store.getState().rtlsSurvey.statusFailures).toBeUndefined();
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
    expect(started).toEqual({
      frame: { preset: 'two-tiers' },
      placement: undefined,
      // A0 at the plan's origin and A1 north of it: the plan is the frame
      transform: PLAN_AS_FRAME,
    });

    // a commit says nothing about the sketch
    play(store, RUN.slice(1));
    acknowledge(store);
    answerWith(COMMIT_INCOMPLETE);
    await run(store, commitRtlsSurvey(CELL));
    expect(store.getState().rtlsSurvey.fittedRequest).toBe(started);
  });

  test('Survey sends nothing while the guard refuses or the sketch lacks a frame', async () => {
    await run(withStandardCell({ authorized: true }), startRtlsSurvey(CELL));
    // no sketch, and anchors that store nothing: no origin, no +x
    const blank = createStore();
    reportAnchors(
      blank,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    await run(blank, startRtlsSurvey(CELL));
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
      fittedRequest: { frame: { preset: 'two-tiers' } },
    });
  });

  test('Commit carries the acknowledgement of the warnings, and none without warnings', async () => {
    const store = withStandardCell();
    play(store, RUN);
    acknowledge(store);
    answerWith(COMMIT_INCOMPLETE);
    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenLastCalledWith(
      { type: 'X-RTLS-SURVEY', action: 'commit', acknowledgeWarnings: true },
      { timeout: 30 }
    );

    // a refit without warnings: nothing to acknowledge
    play(store, [REFIT]);
    answerWith(COMMIT[2]);
    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenLastCalledWith(
      { type: 'X-RTLS-SURVEY', action: 'commit' },
      { timeout: 30 }
    );
  });

  test('a click on Commit that is older than the store sends nothing', async () => {
    // a warning nobody acknowledged
    const waiting = withStandardCell();
    play(waiting, RUN);
    await run(waiting, commitRtlsSurvey(CELL));

    // a block that arrived after the page drew an open commit
    const blocked = withStandardCell();
    play(blocked, RUN);
    acknowledge(blocked);
    play(blocked, [RUN_BLOCKED[1]]);
    await run(blocked, commitRtlsSurvey(CELL));

    // a new warning beside the acknowledged one
    const warned = withStandardCell();
    play(warned, RUN);
    acknowledge(warned);
    play(warned, [
      push({
        ...READY,
        gate: {
          blocked: [],
          warnings: [
            ...READY_WARNINGS,
            { code: 'rms', device: null, peer: null, detail: 'fit rms 0.06 m' },
          ],
        },
      }),
    ]);
    await run(warned, commitRtlsSurvey(CELL));

    // a request still in flight
    const busy = withStandardCell();
    play(busy, RUN);
    acknowledge(busy);
    busy.dispatch(rtlsSurveyRequested('fit'));
    await run(busy, commitRtlsSurvey(CELL));

    // a survey that is no longer ready
    const running = withStandardCell();
    play(running, RUN);
    acknowledge(running);
    play(running, [COMMIT[0]]);
    await run(running, commitRtlsSurvey(CELL));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('nor does a click on Survey, Refit or Cancel', async () => {
    const busy = withStandardCell();
    busy.dispatch(rtlsSurveyRequested('commit'));
    await run(busy, startRtlsSurvey(CELL));

    const running = withStandardCell();
    play(running, RUN.slice(0, 2));
    await run(running, startRtlsSurvey(CELL));
    await run(running, refitRtlsSurvey(CELL));

    const ready = withStandardCell();
    play(ready, RUN);
    await run(ready, cancelRtlsSurvey(CELL));
    ready.dispatch(rtlsSurveyRequested('commit'));
    await run(ready, refitRtlsSurvey(CELL));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("a second survey does not commit on the first one's acknowledgement", async () => {
    const store = withStandardCell();
    play(store, RUN);
    acknowledge(store);

    answerWith(RUN[0]);
    await run(store, startRtlsSurvey(CELL));
    // the same warning comes back with the new measurement
    play(store, RUN.slice(1));
    sendMessage.mockClear();
    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a commit opens no dialog: the page shows its results first', async () => {
    const store = withStandardCell();
    play(store, RUN);
    acknowledge(store);

    answerWith(COMMIT_INCOMPLETE);
    await run(store, commitRtlsSurvey(CELL));
    expect(store.getState().rtls.lockDialogOpen).toBe(false);
    expect(showNotification).not.toHaveBeenCalled();

    answerWith(COMMIT[2]);
    await run(store, commitRtlsSurvey(CELL));
    // the lock is offered under the results, by the page
    expect(store.getState().rtls.lockDialogOpen).toBe(false);
    expect(store.getState().rtlsSurvey.survey?.state).toBe('committed');
    expect(showNotification).toHaveBeenCalledWith(
      'rtlsSurvey.notification.committed'
    );
  });

  test('Commit sends nothing while the guard refuses', async () => {
    const store = withStandardCell({
      uavs: [{ id: '7', age: UAVAge.ACTIVE, errors: [] }],
    });
    play(store, RUN);
    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test("an answer that is not the survey's is a failed request", async () => {
    const store = withStandardCell();
    play(store, RUN.slice(0, 1));
    sendMessage.mockResolvedValueOnce(
      reply({ type: 'ACK-NAK', reason: 'No such action' })
    );
    await run(store, cancelRtlsSurvey(CELL));
    expect(store.getState().rtlsSurvey.outcome).toEqual({
      action: 'cancel',
      result: 'error',
      reason: 'No such action',
    });
  });
});
