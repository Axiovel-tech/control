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
import { setRtlsDevicesFromStatus } from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  surveyControls,
  surveyRefusalKey,
} from '~/features/rtls/survey';
import {
  getRtlsSurveyAnchors,
  getRtlsSurveyPage,
  getRtlsSurveyRefusalKey,
} from '~/features/rtls/survey-selectors';
import { UAVAge } from '~/model/uav';

import { type FakeUav } from './rtls-test-store';
import { RUN } from './survey-recording';
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
    acknowledged: getRtlsSurveyPage(state, CELL).acknowledged,
    refusalKey: getRtlsSurveyRefusalKey(state),
  });
};

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

  test('a survey held for another cell can only be replaced', () => {
    const store = createStore();
    play(store, RUN);
    const held = { ...store.getState().rtlsSurvey, acknowledged: true };
    expect(surveyControls(held)).toMatchObject({
      canRefit: true,
      commitOffered: true,
      canCommit: true,
    });
    expect(surveyControls({ ...held, elsewhere: true })).toMatchObject({
      canStart: true,
      canRefit: false,
      commitOffered: false,
      canCommit: false,
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
