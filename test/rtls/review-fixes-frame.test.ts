import { beforeEach, describe, expect, jest, test } from '@jest/globals';

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
  applyRtlsSleepResults,
  clearRtlsDevices,
  updateRtlsStats,
} from '~/features/rtls/slice';
import { setRtlsSurveySketch } from '~/features/rtls/survey';
import {
  queryRtlsSurvey,
  refitRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { sketchFromBasis, surveyTarget } from '~/features/rtls/survey-frame';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withGroupRemoved,
} from '~/features/rtls/survey-sketch';
import { type RtlsPowerState } from '~/features/rtls/types';
import messageHub from '~/message-hub';

import { reply } from './rtls-test-store';
import { answer, COMMIT, push, READY, REFIT } from './survey-recording';
import {
  CELL,
  createSurveyTestStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
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

const sketchOf = (store: SurveyTestStore): RtlsSurveySketch | undefined =>
  store.getState().rtlsSurvey.sketches[CELL];

const setSketch = (store: SurveyTestStore, sketch: RtlsSurveySketch): void => {
  store.dispatch(setRtlsSurveySketch({ cell: CELL, sketch }));
};

const heldOf = (store: SurveyTestStore) => store.getState().rtlsSurvey.survey;

/** A store whose cell was laid out with "Standard cell". */
const withStandardCell = (): SurveyTestStore => {
  const store = createSurveyTestStore();
  setSketch(store, standardCellSketch(pageOf(store).anchors));
  return store;
};

/** What the last request sent. */
const sent = (): Record<string, unknown> =>
  sendMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;

/** The frame "Standard cell" stands for with the four test anchors. */
const STANDARD_FRAME = { preset: 'two-tiers' };

/** The recorded fit as the server reports it with its echo and a revision. */
const ready = (revision?: number, extra: Record<string, unknown> = {}) =>
  push({
    ...READY,
    frame: STANDARD_FRAME,
    ...(revision === undefined ? {} : { revision }),
    ...extra,
  });

describe('5. an anchor the frame puts in no height group', () => {
  const FOUR: RtlsSurveyAnchor[] = [0, 1, 2, 3].map((slot) => ({
    id: String(101 + slot),
    name: `RTLS anchor A${slot}`,
    slot,
  }));
  /** 104 is in no group, and above the origin's. */
  const ECHO = {
    frame: {
      origin: 101,
      xAxis: 102,
      heightGroups: [[101, 102, 103]],
      upper: [104],
      yPositive: 103,
    },
  };
  const restored = sketchFromBasis(ECHO, FOUR);

  test('is restored as ungrouped, with a level of its own to show', () => {
    expect(restored.ungrouped).toEqual(['104']);
    expect(restored.groupOf).toEqual({
      '101': 0,
      '102': 0,
      '103': 0,
      '104': 1,
    });
  });

  test('is not sent as a group of one', () => {
    expect(surveyTarget(restored, FOUR)?.frame).toEqual(ECHO.frame);
  });

  test('one below the origin stays out of the groups and out of upper', () => {
    const below = sketchFromBasis(
      { frame: { ...ECHO.frame, upper: [] } },
      FOUR
    );
    expect(below.ungrouped).toEqual(['104']);
    expect(surveyTarget(below, FOUR)?.frame).toEqual({
      ...ECHO.frame,
      upper: [],
    });
  });

  test('a Refit with no edit sends the frame the server echoed', async () => {
    const store = createSurveyTestStore();
    reportAnchors(
      store,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    play(store, [push({ ...READY, ...ECHO })]);
    expect(pageOf(store).sketchRestored).toBe(true);
    expect(pageOf(store).sketchChanged).toBe(false);

    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sent()).toEqual({
      type: 'X-RTLS-SURVEY',
      action: 'fit',
      frame: ECHO.frame,
    });
  });

  test('a frame without such an anchor names none', () => {
    const grouped = sketchFromBasis(
      { frame: { ...ECHO.frame, heightGroups: [[101, 102, 103], [104]] } },
      FOUR
    );
    expect(grouped).not.toHaveProperty('ungrouped');
    // a group of one the frame itself declares is sent back as it came
    expect(surveyTarget(grouped, FOUR)?.frame).toMatchObject({
      heightGroups: [[101, 102, 103], [104]],
    });
  });

  test('a group chosen for it, or company, makes it a group like any other', () => {
    const chosen = withAnchorGroup(restored, '104', 0);
    expect(chosen.ungrouped).toEqual([]);
    expect(surveyTarget(chosen, FOUR)?.frame).toMatchObject({
      heightGroups: [[101, 102, 103, 104]],
    });

    const joined = withAnchorGroup(restored, '103', 1);
    expect(surveyTarget(joined, FOUR)?.frame).toMatchObject({
      heightGroups: [
        [101, 102],
        [103, 104],
      ],
    });
  });

  test('removing the level it shows as puts it in Lower, as a member', () => {
    // 104 alone above Upper: level 2, a numbered group in the list
    const high = sketchFromBasis(
      {
        frame: {
          origin: 101,
          xAxis: 102,
          heightGroups: [
            [101, 102],
            [103, 105],
          ],
          upper: [103, 105, 104],
        },
      },
      [...FOUR, { id: '105', name: 'RTLS anchor A4', slot: 4 }]
    );
    expect(high.groupOf['104']).toBe(2);
    expect(withGroupRemoved(high, 2)).toMatchObject({
      ungrouped: [],
      groupOf: { '104': 0 },
    });
  });
});

describe('6. an older state never replaces a newer one', () => {
  const COMMITTED = COMMIT[2].body.survey as Record<string, unknown>;

  test('a status reply with a lower revision is dropped', () => {
    const store = withStandardCell();
    play(store, [push({ ...COMMITTED, revision: 8 })]);
    // the reply to a status request the server answered before it committed
    play(store, [answer('status', 'status', { ...READY, revision: 7 })]);
    expect(heldOf(store)).toMatchObject({ state: 'committed', revision: 8 });
    // the lock offer stays, and Commit does not come back
    expect(pageOf(store).controls.commitOffered).toBe(false);
  });

  test('so is a notification with a lower one; the same revision is taken', () => {
    const store = withStandardCell();
    play(store, [push({ ...COMMITTED, revision: 8 })]);
    play(store, [push({ ...READY, revision: 7 })]);
    expect(heldOf(store)?.state).toBe('committed');
    play(store, [push({ ...READY, revision: 8 })]);
    expect(heldOf(store)?.state).toBe('ready');
    play(store, [push({ ...COMMITTED, revision: 9 })]);
    expect(heldOf(store)).toMatchObject({ state: 'committed', revision: 9 });
  });

  test('an overtaken answer still says what the request came to', () => {
    const store = withStandardCell();
    play(store, [ready(7)]);
    play(store, [push({ ...COMMITTED, revision: 9 })]);
    play(store, [
      answer('commit', 'committed', {
        ...COMMITTED,
        state: 'committing',
        revision: 8,
      }),
    ]);
    expect(heldOf(store)).toMatchObject({ state: 'committed', revision: 9 });
    expect(store.getState().rtlsSurvey).toMatchObject({
      pending: undefined,
      outcome: { action: 'commit', result: 'committed' },
    });
  });

  test('a connection made anew forgets the held revision', () => {
    const store = withStandardCell();
    play(store, [push({ ...COMMITTED, revision: 8 })]);
    // the server was restarted and counts from the start again
    store.dispatch(clearRtlsDevices());
    play(store, [answer('status', 'status', { ...READY, revision: 1 })]);
    expect(heldOf(store)).toMatchObject({ state: 'ready', revision: 1 });
  });

  describe('with a server that sends no revision', () => {
    /** A status request under way, to be answered by `answerStatus`. */
    const asking = (store: SurveyTestStore) => {
      let answerStatus: (survey: Record<string, unknown>) => void = noop;
      sendMessage.mockReturnValueOnce(
        new Promise((resolve) => {
          answerStatus = (survey) =>
            resolve(reply(answer('status', 'status', survey).body));
        })
      );
      const done = run(store, queryRtlsSurvey());
      return {
        done,
        answerStatus: (survey: Record<string, unknown>) => answerStatus(survey),
      };
    };

    test('a status reply does not overwrite a state received after it was asked', async () => {
      const store = withStandardCell();
      play(store, [ready()]);
      const { answerStatus, done } = asking(store);
      // the commit lands while the reply is under way
      play(store, [push(COMMITTED)]);
      answerStatus(READY);
      await done;
      expect(heldOf(store)?.state).toBe('committed');
      expect(pageOf(store).controls.commitOffered).toBe(false);
    });

    test('a status reply with nothing received since is the survey', async () => {
      const store = withStandardCell();
      const { answerStatus, done } = asking(store);
      answerStatus(READY);
      await done;
      expect(heldOf(store)?.state).toBe('ready');

      const again = asking(store);
      again.answerStatus(COMMITTED);
      await again.done;
      expect(heldOf(store)?.state).toBe('committed');
    });
  });
});

describe('7. which anchors a survey must include', () => {
  /** The standard cell with anchor 104 unticked and in the given state. */
  const leavingOut = (
    powerState?: RtlsPowerState,
    sleeping?: boolean
  ): SurveyTestStore => {
    const store = withStandardCell();
    setSketch(store, withAnchorIncluded(sketchOf(store)!, '104', false)); // non-null: sketched
    if (powerState !== undefined) {
      store.dispatch(
        updateRtlsStats({ byId: { '104': { id: '104', powerState } } })
      );
    }
    if (sleeping !== undefined) {
      store.dispatch(applyRtlsSleepResults({ '104': sleeping }));
    }
    return store;
  };

  test('an operating anchor, and one that reports no power state', () => {
    expect(pageOf(leavingOut('operating')).leftOut).toEqual(['104']);
    expect(pageOf(leavingOut()).leftOut).toEqual(['104']);
    expect(pageOf(leavingOut()).controls.canStart).toBe(false);
    // the heartbeat's sleep latch is no power state: the server asks for it
    expect(pageOf(leavingOut(undefined, true)).leftOut).toEqual(['104']);
  });

  test('not one that reports any other power state: a fault can be left out', () => {
    for (const powerState of [
      'fault',
      'asleep',
      'standby',
      'booting',
      'stopping',
      'unknown',
    ] as const) {
      const page = pageOf(leavingOut(powerState));
      expect(page.leftOut).toEqual([]);
      expect(page.controls.canStart).toBe(true);
    }
  });
});
