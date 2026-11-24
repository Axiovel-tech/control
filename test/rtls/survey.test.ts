import { describe, expect, jest, test } from '@jest/globals';

// The show selectors sit on a heavy import chain; the test store carries the
// one show field the guard reads.
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  isShowAuthorizedToStartLocally: (state: {
    show: { start: { authorized: boolean } };
  }): boolean => state.show.start.authorized,
}));

import {
  buildRtlsDeviceStatusMap,
  rtlsInformationActions,
} from '~/features/rtls/handlers';
import {
  clearRtlsDevices,
  setRtlsDevicesFromStatus,
} from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  anchorsLeftBehind,
  handleRtlsSurveyMessage,
  residualLevel,
  rtlsSurveyRequested,
  setRtlsSurveySketch,
  surveyControls,
  surveyRefusalKey,
} from '~/features/rtls/survey';
import {
  mapRtlsSurvey,
  mapRtlsSurveyAnswer,
  surveyOfBody,
} from '~/features/rtls/survey-messages';
import {
  areRtlsSurveyWarningsAcknowledged,
  getRtlsSurveyAnchors,
  getRtlsSurveyRefusalKey,
} from '~/features/rtls/survey-selectors';
import { EMPTY_SKETCH } from '~/features/rtls/survey-sketch';
import { UAVAge } from '~/model/uav';
import { type AppDispatch } from '~/store/reducers';

import { type FakeUav } from './rtls-test-store';
import {
  COMMIT,
  COMMIT_BLOCKED,
  COMMIT_INCOMPLETE,
  COMMIT_WARNINGS,
  REFIT,
  RUN,
  RUN_BLOCKED,
  RUN_CANCELLED,
  RUN_FAILED,
  START_REFUSED,
  STATUS_IDLE,
} from './survey-recording';
import {
  CELL,
  createSurveyTestStore as createStore,
  information,
  play,
  stateOf,
  type SurveyTestStore as TestStore,
} from './survey-test-store';

/** What the page offers for the store's survey, with a sketch that is fine. */
const controlsOf = (store: TestStore) => {
  const state = stateOf(store);
  return surveyControls({
    ...state.rtlsSurvey,
    acknowledged: areRtlsSurveyWarningsAcknowledged(state),
    refusalKey: getRtlsSurveyRefusalKey(state),
  });
};

const surveyOf = (store: TestStore) => store.getState().rtlsSurvey.survey;

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

    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    expect(controlsOf(store)).toMatchObject({
      canCommit: true,
      commitBlockedKey: undefined,
    });

    // a refit that changes the warnings voids the acknowledgement
    play(store, [REFIT]);
    expect(areRtlsSurveyWarningsAcknowledged(stateOf(store))).toBe(false);
    expect(surveyOf(store)?.gate.warnings).toEqual([]);
    expect(controlsOf(store).canCommit).toBe(true);
  });

  test('committing, then committed: per anchor, and who runs the new ID', () => {
    const store = createStore();
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));

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
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
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

  test('cancel: the answer, then the end the server reports', () => {
    const store = createStore();
    play(store, RUN_CANCELLED.slice(0, 2));
    expect(surveyOf(store)?.state).toBe('returning');
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      action: 'cancel',
      result: 'cancelled',
    });
    play(store, RUN_CANCELLED.slice(2));
    expect(surveyOf(store)).toMatchObject({
      state: 'failed',
      reason: 'Cancelled',
    });
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

    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
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
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
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

describe('the wire mapping', () => {
  test('a body without a known state replaces nothing', () => {
    expect(mapRtlsSurvey(undefined)).toBeUndefined();
    expect(mapRtlsSurvey({ state: 'dancing' })).toBeUndefined();
    const store = createStore();
    play(store, RUN);
    handleRtlsSurveyMessage(
      { type: 'X-RTLS-SURVEY', survey: { state: 'dancing' } },
      store.dispatch as AppDispatch
    );
    expect(surveyOf(store)?.state).toBe('ready');
  });

  test('the state object is read from `survey`, or bare', () => {
    expect(surveyOfBody({ survey: { state: 'idle' } })?.state).toBe('idle');
    expect(
      surveyOfBody({ type: 'X-RTLS-SURVEY', state: 'measuring', step: 2 })
    ).toMatchObject({ state: 'measuring', step: 2 });
  });

  test('absent members read as empty; a direction left out stays out', () => {
    const survey = mapRtlsSurvey({
      state: 'ready',
      pairs: [{ a: 1, b: 2, rangeM: 3, ab: null, ba: { n: 40, share: 0.6 } }],
    });
    expect(survey).toMatchObject({
      anchors: [],
      gate: { blocked: [], warnings: [] },
    });
    expect(survey?.fit).toBeUndefined();
    expect(survey?.commit).toBeUndefined();
    expect(survey?.pairs[0].ab).toBeUndefined();
    expect(survey?.pairs[0].ba).toMatchObject({ n: 40, share: 0.6 });
  });

  test('an answer with a result this client does not know is `unknown`', () => {
    expect(
      mapRtlsSurveyAnswer('fit', { type: 'X-RTLS-SURVEY', result: 'mended' })
    ).toMatchObject({ action: 'fit', result: 'unknown' });
  });

  test("residuals are coloured at the commit warnings' bounds", () => {
    expect(residualLevel(undefined)).toBe('ok');
    expect(residualLevel(0.05)).toBe('ok');
    expect(residualLevel(-0.051)).toBe('warning');
    expect(residualLevel(0.1)).toBe('warning');
    expect(residualLevel(-0.101)).toBe('error');
  });
});

describe('the guard on Survey and Commit', () => {
  const live = {
    lockedCount: 0,
    showAuthorized: false,
    armedCount: 0,
    anyOnline: true,
  };

  test("the cell Apply's guard, with an authorized show between", () => {
    expect(surveyRefusalKey(live)).toBeUndefined();
    expect(surveyRefusalKey({ ...live, lockedCount: 1 })).toBe(
      'rtlsCellSettings.unlockFirst'
    );
    expect(surveyRefusalKey({ ...live, showAuthorized: true })).toBe(
      'rtlsSurvey.refusal.showAuthorized'
    );
    expect(surveyRefusalKey({ ...live, armedCount: 2 })).toBe(
      'rtlsCellSettings.disarmFirst'
    );
    expect(surveyRefusalKey({ ...live, anyOnline: false })).toBe(
      'rtlsCellSettings.noDevices'
    );
    // locked anchors come first: unlocking is what the operator does next
    expect(
      surveyRefusalKey({
        lockedCount: 4,
        showAuthorized: true,
        armedCount: 1,
        anyOnline: true,
      })
    ).toBe('rtlsCellSettings.unlockFirst');
  });

  test('locked anchors disable Survey and Commit, with the reason', () => {
    const store = createStore();
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    expect(controlsOf(store)).toMatchObject({
      canStart: true,
      canCommit: true,
    });

    for (const action of rtlsInformationActions(information(4))) {
      store.dispatch(action);
    }
    expect(getRtlsSurveyRefusalKey(stateOf(store))).toBe(
      'rtlsCellSettings.unlockFirst'
    );
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsCellSettings.unlockFirst',
      canCommit: false,
      commitBlockedKey: 'rtlsCellSettings.unlockFirst',
      // a refit writes nothing to an anchor
      canRefit: true,
    });
  });

  test('an authorized show disables them', () => {
    const store = createStore({ authorized: true });
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsSurvey.refusal.showAuthorized',
      canCommit: false,
      commitBlockedKey: 'rtlsSurvey.refusal.showAuthorized',
    });
  });

  test('a drone that may be armed disables them; one known disarmed does not', () => {
    const maybeArmed: FakeUav = { id: '7', age: UAVAge.ACTIVE, errors: [] };
    const store = createStore({ uavs: [maybeArmed] });
    play(store, RUN);
    store.dispatch(acknowledgeRtlsSurveyWarnings(true));
    expect(controlsOf(store)).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsCellSettings.disarmFirst',
      canCommit: false,
      commitBlockedKey: 'rtlsCellSettings.disarmFirst',
    });

    const disarmed = createStore({ uavs: [{ ...maybeArmed, armed: false }] });
    expect(getRtlsSurveyRefusalKey(stateOf(disarmed))).toBeUndefined();
  });

  test('no online anchor, or a server without the survey', () => {
    const store = createStore();
    store.dispatch(
      setRtlsDevicesFromStatus(
        buildRtlsDeviceStatusMap({
          '101': { online: false, role: 'anchor-initiator' },
        })
      )
    );
    expect(getRtlsSurveyAnchors(stateOf(store))).toEqual([]);
    expect(getRtlsSurveyRefusalKey(stateOf(store))).toBe(
      'rtlsCellSettings.noDevices'
    );

    expect(
      surveyControls({ available: false, acknowledged: false })
    ).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsSurvey.refusal.noServer',
    });
  });

  test('a sketch that lacks something disables Survey, or Refit', () => {
    expect(
      surveyControls({
        acknowledged: false,
        startProblemKey: 'rtlsSurvey.problem.pickOrigin',
      })
    ).toMatchObject({
      canStart: false,
      startBlockedKey: 'rtlsSurvey.problem.pickOrigin',
    });
    const store = createStore();
    play(store, RUN);
    expect(
      surveyControls({
        ...store.getState().rtlsSurvey,
        acknowledged: false,
        refitProblemKey: 'rtlsSurvey.problem.pickXAxis',
      }).canRefit
    ).toBe(false);
  });
});
