import { describe, expect, jest, test } from '@jest/globals';

// The show selectors sit on a heavy import chain; the test store carries the
// one show field the guard reads.
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  isShowAuthorizedToStartLocally: (state: {
    show: { start: { authorized: boolean } };
  }): boolean => state.show.start.authorized,
}));

import { clearRtlsDevices } from '~/features/rtls/slice';
import {
  anchorsLeftBehind,
  rtlsSurveyRequested,
  setRtlsSurveySketch,
  surveyControls,
} from '~/features/rtls/survey';
import {
  getRtlsSurveyPage,
  getRtlsSurveyRefusalKey,
} from '~/features/rtls/survey-selectors';
import { EMPTY_SKETCH } from '~/features/rtls/survey-sketch';

import {
  answer,
  COMMIT,
  COMMIT_BLOCKED,
  COMMIT_INCOMPLETE,
  COMMIT_UNCONFIRMED,
  COMMIT_WARNINGS,
  push,
  READY,
  REFIT,
  RUN,
  RUN_BLOCKED,
  RUN_CANCELLED,
  RUN_FAILED,
  START_REFUSED,
  STATUS_IDLE,
} from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore as createStore,
  play,
  stateOf,
  type SurveyTestStore as TestStore,
} from './survey-test-store';

/** What the page offers for the store's survey, with a sketch that is fine. */
const controlsOf = (store: TestStore) => {
  const state = stateOf(store);
  return surveyControls({
    ...state.rtlsSurvey,
    acknowledged: getRtlsSurveyPage(state, CELL).acknowledged,
    refusalKey: getRtlsSurveyRefusalKey(state),
  });
};

/** The fit of the recorded run, as it travels. */
const READY_FIT = READY.fit as Record<string, unknown>;

const surveyOf = (store: TestStore) => store.getState().rtlsSurvey.survey;

const acknowledgedOf = (store: TestStore): boolean =>
  getRtlsSurveyPage(stateOf(store), CELL).acknowledged;

describe('the survey state over a recorded run', () => {
  test('idle: Survey is on offer, nothing else', () => {
    const store = createStore();
    play(store, [STATUS_IDLE]);

    expect(surveyOf(store)).toMatchObject({ state: 'idle', anchors: [] });
    // a status answer is not an outcome of the operator's
    expect(store.getState().rtlsSurvey.outcome).toBeUndefined();
    expect(controlsOf(store)).toEqual({
      canStart: true,
      startBlockedKey: undefined,
      canCancel: false,
      canRefit: false,
      commitOffered: false,
      canCommit: false,
      commitBlockedKey: undefined,
      retry: false,
    });
  });

  test('measuring: the steps and their initiators follow the pushes', () => {
    const store = createStore();
    play(store, RUN.slice(0, 1));
    expect(surveyOf(store)).toMatchObject({
      state: 'measuring',
      step: 1,
      steps: 4,
      initiator: '101',
      anchors: ['101', '102', '103', '104'],
    });
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsSurvey.refusal.running',
      canCancel: true,
      canRefit: false,
      commitOffered: false,
    });

    const seen: Array<[number | undefined, string | undefined]> = [];
    for (const message of RUN.slice(1, 4)) {
      play(store, [message]);
      seen.push([surveyOf(store)?.step, surveyOf(store)?.initiator]);
    }
    expect(seen).toEqual([
      [2, '102'],
      [3, '103'],
      [4, '104'],
    ]);
  });

  test('returning: nothing to cancel, nothing to start', () => {
    const store = createStore();
    play(store, RUN.slice(0, 5));
    expect(surveyOf(store)?.state).toBe('returning');
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      canCancel: false,
      canRefit: false,
      commitOffered: false,
    });
  });

  test("ready: the fit, its pairs and the gate are the server's", () => {
    const store = createStore();
    play(store, RUN);
    const survey = surveyOf(store);

    expect(survey?.state).toBe('ready');
    expect(survey?.pairs).toHaveLength(6);
    expect(survey?.pairs[3]).toMatchObject({
      a: '102',
      b: '103',
      rangeM: 4.93,
      residualM: 0.0737,
      ba: { share: 0.84 },
    });
    expect(survey?.fit).toMatchObject({
      rmsM: 0.0312,
      worstM: 0.0737,
      planar: true,
      notes: ['anchors 103 and 104 are swapped against the placement'],
    });
    expect(survey?.fit?.anchors['103']).toMatchObject({
      x: 0.0018,
      y: 3.0022,
      links: 3,
      movedM: 0.154,
    });
    // an anchor that stores no position has no move
    expect(survey?.fit?.anchors['104'].movedM).toBeUndefined();
    expect(survey?.gate).toEqual({
      blocked: [],
      warnings: [
        {
          code: 'low-share',
          device: '102',
          peer: '103',
          detail:
            'valid share 0.84 of the ranges 102 measured while 103 initiated',
        },
      ],
    });
    // the outcome of the start does not outlive the run
    expect(store.getState().rtlsSurvey.outcome).toBeUndefined();
    expect(controlsOf(store)).toMatchObject({
      canStart: true,
      canRefit: true,
      commitOffered: true,
      canCommit: false,
      commitBlockedKey: 'rtlsSurvey.commit.acknowledgeFirst',
      retry: false,
    });
  });

  test('warnings: one acknowledgement opens the commit, for these warnings only', () => {
    const store = createStore();
    play(store, RUN);

    // a commit without it comes back with the warnings
    play(store, [COMMIT_WARNINGS]);
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      action: 'commit',
      result: 'warnings',
    });
    expect(controlsOf(store).canCommit).toBe(false);

    acknowledge(store);
    expect(controlsOf(store)).toMatchObject({
      canCommit: true,
      commitBlockedKey: undefined,
    });

    // a refit that changes the warnings voids the acknowledgement
    play(store, [REFIT]);
    expect(acknowledgedOf(store)).toBe(false);
    expect(surveyOf(store)?.gate.warnings).toEqual([]);
    expect(controlsOf(store).canCommit).toBe(true);
  });

  test('a new measurement needs a fresh acknowledgement of the same warning', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    expect(acknowledgedOf(store)).toBe(true);

    // surveyed again without committing: the same warning comes back
    play(store, RUN);
    expect(surveyOf(store)?.gate.warnings).toHaveLength(1);
    expect(acknowledgedOf(store)).toBe(false);
    expect(controlsOf(store)).toMatchObject({
      canCommit: false,
      commitBlockedKey: 'rtlsSurvey.commit.acknowledgeFirst',
    });
  });

  test('so does a refit, whatever it comes back with', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    // the same fit and the same warning again
    play(store, [answer('fit', 'fitted', READY)]);
    expect(acknowledgedOf(store)).toBe(false);
  });

  test('and a fit another client asked for', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    // the same state again changes nothing
    play(store, [push(READY)]);
    expect(acknowledgedOf(store)).toBe(true);
    // another fit with the same warning
    play(store, [push({ ...READY, fit: { ...READY_FIT, rmsM: 0.0401 } })]);
    expect(acknowledgedOf(store)).toBe(false);
  });

  test('committing, then committed: per anchor, and who runs the new ID', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);

    play(store, COMMIT.slice(0, 2));
    expect(surveyOf(store)).toMatchObject({
      state: 'committing',
      commit: { surveyId: 12, running: ['101', '102'] },
    });
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsSurvey.refusal.running',
      commitOffered: false,
      canCommit: false,
    });

    play(store, COMMIT.slice(2));
    const survey = surveyOf(store);
    expect(survey?.state).toBe('committed');
    expect(survey?.commit?.results['104']).toEqual({
      written: 'changed',
      detail: '',
    });
    expect(survey?.commit?.running).toEqual(['101', '102', '103', '104']);
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      action: 'commit',
      result: 'committed',
    });
    // nothing left to commit; a new survey may start
    expect(controlsOf(store)).toMatchObject({
      canStart: true,
      commitOffered: false,
      retry: false,
    });
    // the acknowledgement was for that commit
    expect(store.getState().rtlsSurvey.acknowledged).toBeUndefined();
  });

  test('incomplete: back in ready with the anchors left behind, and Retry', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    play(store, [COMMIT_INCOMPLETE]);

    expect(surveyOf(store)?.state).toBe('ready');
    expect(store.getState().rtlsSurvey.outcome).toEqual({
      action: 'commit',
      result: 'incomplete',
      reason: 'Not every anchor took the survey',
    });
    expect(anchorsLeftBehind(surveyOf(store))).toEqual(['104']);
    expect(surveyOf(store)?.commit?.results['104']).toEqual({
      written: 'failed',
      detail: 'no answer',
    });
    expect(controlsOf(store)).toMatchObject({ canCommit: true, retry: true });

    // the retry completes it
    play(store, COMMIT.slice(2));
    expect(surveyOf(store)?.state).toBe('committed');
    expect(controlsOf(store).retry).toBe(false);
  });

  test("refused: the server's reason, and the survey stays where it was", () => {
    const store = createStore();
    play(store, [STATUS_IDLE, START_REFUSED]);
    expect(surveyOf(store)?.state).toBe('idle');
    expect(store.getState().rtlsSurvey.outcome).toEqual({
      action: 'start',
      result: 'refused',
      reason: 'Unlock the anchors first',
    });
    expect(controlsOf(store).canStart).toBe(true);
  });

  test('failed: the run returns, then says why; a new one may start', () => {
    const store = createStore();
    play(store, RUN_FAILED);
    expect(surveyOf(store)).toMatchObject({
      state: 'failed',
      reason: 'RTLS anchor A2 refused the survey step: locked',
    });
    expect(surveyOf(store)?.fit).toBeUndefined();
    expect(controlsOf(store)).toMatchObject({
      canStart: true,
      canCancel: false,
      canRefit: false,
      commitOffered: false,
    });
  });

  test('cancel: the answer, then idle with the reason, not a failure', () => {
    const store = createStore();
    play(store, RUN_CANCELLED.slice(0, 2));
    expect(surveyOf(store)?.state).toBe('returning');
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      action: 'cancel',
      result: 'cancelled',
    });
    play(store, RUN_CANCELLED.slice(2));
    expect(surveyOf(store)).toMatchObject({
      state: 'idle',
      reason: 'cancelled',
    });
    expect(controlsOf(store).canStart).toBe(true);
  });

  test('a commit every anchor took but one never confirmed names it, with Retry', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    play(store, [COMMIT_UNCONFIRMED]);

    // no write failed: who is missing is who does not run the new ID
    expect(
      Object.values(surveyOf(store)?.commit?.results ?? {}).map(
        ({ written }) => written
      )
    ).toEqual(['changed', 'changed', 'changed', 'changed']);
    expect(anchorsLeftBehind(surveyOf(store))).toEqual(['104']);
    expect(controlsOf(store)).toMatchObject({ canCommit: true, retry: true });
  });

  test('nobody is left behind before a commit, or while one runs', () => {
    const store = createStore();
    play(store, RUN);
    expect(anchorsLeftBehind(surveyOf(store))).toEqual([]);
    expect(controlsOf(store).retry).toBe(false);
    // two of four confirmed so far: that is progress, not a failure
    play(store, COMMIT.slice(0, 2));
    expect(anchorsLeftBehind(surveyOf(store))).toEqual([]);
  });

  test('blocked: no acknowledgement opens the commit', () => {
    const store = createStore();
    play(store, RUN_BLOCKED);
    const survey = surveyOf(store);

    // the missing pair is in the gate only, and its anchor has no sigma
    expect(survey?.pairs).toHaveLength(5);
    expect(survey?.fit?.anchors['104']).toMatchObject({ links: 2 });
    expect(survey?.fit?.anchors['104'].sigmaM).toBeUndefined();
    expect(survey?.gate.blocked).toEqual([
      {
        code: 'pair-missing',
        device: '103',
        peer: '104',
        detail: 'no usable range between 103 and 104',
      },
      {
        code: 'not-located',
        device: '104',
        peer: undefined,
        detail: 'the ranges leave 104 undetermined',
      },
    ]);

    acknowledge(store);
    expect(controlsOf(store)).toMatchObject({
      commitOffered: true,
      canCommit: false,
      commitBlockedKey: 'rtlsSurvey.commit.blocked',
      // the sketch may be fixed and fitted again
      canRefit: true,
    });

    play(store, [COMMIT_BLOCKED]);
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      result: 'blocked',
    });
  });

  test('a request in flight offers nothing until it is answered', () => {
    const store = createStore();
    play(store, RUN);
    acknowledge(store);
    store.dispatch(rtlsSurveyRequested('commit'));
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      canRefit: false,
      canCommit: false,
    });
  });

  test('a dropped connection drops the survey and keeps the sketches', () => {
    const store = createStore();
    play(store, RUN);
    store.dispatch(
      setRtlsSurveySketch({
        cell: CELL,
        sketch: { ...EMPTY_SKETCH, origin: '101' },
      })
    );
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtlsSurvey).toEqual({
      sketches: { [CELL]: { ...EMPTY_SKETCH, origin: '101' } },
    });
  });
});
