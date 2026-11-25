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

import { clearRtlsDevices, updateRtlsStats } from '~/features/rtls/slice';
import {
  gateVerdict,
  pairsNeedALook,
  setRtlsSurveySketch,
} from '~/features/rtls/survey';
import {
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { heldFitTransform, PLAN_AS_FRAME } from '~/features/rtls/survey-frame';
import { mapRtlsSurvey } from '~/features/rtls/survey-messages';
import { LEFT_OUT_PROBLEM_KEY } from '~/features/rtls/survey-page';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  EMPTY_SKETCH,
  leftOutOperating,
  planMarkers,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorIncluded,
  withAnchorMoved,
  withPositionsCommitted,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';

import { reply } from './rtls-test-store';
import { COMMIT, push, READY, REFIT, RUN } from './survey-recording';
import {
  CELL,
  createSurveyTestStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
  run,
  stateOf,
  type SurveyTestStore,
  type TestAnchor,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

beforeEach(() => {
  sendMessage.mockReset();
});

const pageOf = (store: SurveyTestStore) =>
  getRtlsSurveyPage(stateOf(store), CELL);

const sketchOf = (store: SurveyTestStore): RtlsSurveySketch | undefined =>
  store.getState().rtlsSurvey.sketches[CELL];

const setSketch = (store: SurveyTestStore, sketch: RtlsSurveySketch): void => {
  store.dispatch(setRtlsSurveySketch({ cell: CELL, sketch }));
};

/** A store whose cell was laid out with "Standard cell". */
const withStandardCell = (): SurveyTestStore => {
  const store = createSurveyTestStore();
  setSketch(store, standardCellSketch(pageOf(store).anchors));
  return store;
};

/** Anchors 100 + slot, none storing a position. */
const anchorsAt = (...slots: number[]): RtlsSurveyAnchor[] =>
  slots.map((slot) => ({
    id: String(100 + slot),
    name: `RTLS anchor A${slot}`,
    slot,
  }));

/** The four anchors once they report what a commit wrote. */
const SURVEYED: TestAnchor[] = [
  { id: 101, slot: 0, stored: { north: 0, east: 0, down: 0 } },
  { id: 102, slot: 1, stored: { north: 4, east: 0, down: 0.012 } },
  { id: 103, slot: 2, stored: { north: 0.002, east: 3, down: -0.004 } },
  { id: 104, slot: 3, stored: { north: 0.001, east: 0, down: -2.5 } },
];

describe('6. the gate with the result', () => {
  const READY_SURVEY = mapRtlsSurvey(READY)!; // non-null: a recorded state
  const gate = (blocked: number, warnings: number) => ({
    blocked: Array.from({ length: blocked }, () => ({ code: 'x', detail: '' })),
    warnings: Array.from({ length: warnings }, () => ({
      code: 'y',
      detail: '',
    })),
  });

  test('a gate that passes has a verdict too', () => {
    expect(gateVerdict(gate(0, 0))).toBe('clear');
    expect(gateVerdict(gate(0, 2))).toBe('warnings');
    expect(gateVerdict(gate(1, 0))).toBe('blocked');
    // a block is what counts when there are both
    expect(gateVerdict(gate(1, 3))).toBe('blocked');
  });

  test('the pair table opens by itself only for a pair past a bound', () => {
    // the recorded fit has a pair at 7.4 cm
    expect(pairsNeedALook(READY_SURVEY)).toBe(true);
    const calm = {
      ...READY_SURVEY,
      pairs: READY_SURVEY.pairs.map((pair) => ({ ...pair, residualM: -0.049 })),
    };
    expect(pairsNeedALook(calm)).toBe(false);
    expect(pairsNeedALook({ ...READY_SURVEY, pairs: [] })).toBe(false);
  });
});

describe('7. and 10. a commit', () => {
  /** The state object of the recorded commit, once every anchor took it. */
  const COMMITTED_SURVEY = COMMIT[2].body.survey as Record<string, unknown>;

  const committed = (): SurveyTestStore => {
    const store = withStandardCell();
    reportAnchors(
      store,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    play(store, RUN);
    play(store, COMMIT);
    return store;
  };

  test('takes what was drawn of its anchors out of the sketch', () => {
    const before = withStandardCell();
    expect(Object.keys(sketchOf(before)?.positions ?? {})).toHaveLength(4);

    const store = committed();
    expect(store.getState().rtlsSurvey.survey?.state).toBe('committed');
    expect(sketchOf(store)).toMatchObject({
      positions: {},
      standard: false,
      // the groups and the frame stay, for the next survey
      origin: '101',
      xAxis: '102',
      groupOf: { '101': 0, '104': 0 },
    });
    expect(store.getState().rtlsSurvey.committedSurveyId).toBe(12);
  });

  test('so the plan shows the stored positions, not the sketch', () => {
    const store = committed();
    // the anchors now report what the commit wrote
    reportAnchors(store, SURVEYED);
    const { anchors, sketch } = pageOf(store);
    expect(planMarkers(sketch, anchors)['104']).toEqual({
      point: { north: 0.001, east: 0 },
      known: true,
    });
  });

  test('until they report it, the markers are where the fit put them', () => {
    const { anchors, sketch } = pageOf(committed());
    const found = { '104': { north: 4.0029, east: 3.0019 } };
    expect(planMarkers(sketch, anchors, found)['104']).toEqual({
      point: found['104'],
      known: true,
    });
    // the committed fit is drawn as the frame the anchors store
    expect(
      heldFitTransform({
        sketch,
        group: anchors,
        committed: true,
        remembered: {
          frame: { preset: 'two-tiers' },
          transform: { origin: { north: 2, east: 2 }, cos: 0, sin: 1 },
        },
      })
    ).toBe(PLAN_AS_FRAME);
  });

  test('the same commit, reported again, takes nothing drawn since', () => {
    const store = committed();
    setSketch(
      store,
      withAnchorMoved(sketchOf(store)!, '103', { north: 1, east: 1 }) // non-null: sketched
    );
    // a reconnect asks again, and another client's page pushes it again
    play(store, [COMMIT[2], push(COMMITTED_SURVEY)]);
    expect(sketchOf(store)?.positions).toEqual({
      '103': { north: 1, east: 1 },
    });
    // nor after a reload, which keeps the sketches and the commit they saw
    store.dispatch(clearRtlsDevices());
    expect(store.getState().rtlsSurvey.committedSurveyId).toBe(12);
    play(store, [COMMIT[2]]);
    expect(sketchOf(store)?.positions).toEqual({
      '103': { north: 1, east: 1 },
    });
  });

  test('the next commit does again', () => {
    const store = committed();
    setSketch(
      store,
      withAnchorMoved(sketchOf(store)!, '103', { north: 1, east: 1 }) // non-null: sketched
    );
    const next = COMMITTED_SURVEY;
    play(store, [
      push({ ...next, commit: { ...(next.commit as object), surveyId: 13 } }),
    ]);
    expect(sketchOf(store)?.positions).toEqual({});
    expect(store.getState().rtlsSurvey.committedSurveyId).toBe(13);
  });

  test('a sketch of other anchors is left alone', () => {
    const other: RtlsSurveySketch = {
      ...EMPTY_SKETCH,
      positions: { '301': { north: 1, east: 2 } },
    };
    expect(withPositionsCommitted(other, ['101', '102'])).toBe(other);
  });

  test('a frame taken from the echo shows the stored positions too', () => {
    const store = createSurveyTestStore();
    const survey = COMMITTED_SURVEY;
    play(store, [
      push({
        ...survey,
        frame: {
          origin: 101,
          xAxis: 102,
          heightGroups: [[101, 102, 103, 104]],
          upper: [],
        },
        placement: { '104': { x: 9, y: 9 } },
      }),
    ]);
    const page = pageOf(store);
    expect(page.sketchRestored).toBe(true);
    expect(page.sketch.positions).toEqual({});
  });
});

describe('10. a refit says what it came to', () => {
  const refitted = async (store: SurveyTestStore): Promise<void> => {
    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
  };

  test('the positions changed, or the result is the same', async () => {
    const store = withStandardCell();
    play(store, RUN);
    // the recorded refit drops a note: another fit
    await refitted(store);
    expect(store.getState().rtlsSurvey.outcome).toEqual({
      action: 'fit',
      result: 'fitted',
      reason: undefined,
      unchanged: false,
    });
    // the same again: nothing changed, and the page can say so
    await refitted(store);
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      result: 'fitted',
      unchanged: true,
    });
  });

  test('only a refit carries the word', async () => {
    const store = withStandardCell();
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    expect(store.getState().rtlsSurvey.outcome).not.toHaveProperty('unchanged');
  });
});

describe('11. an operating anchor of the cell left out', () => {
  const leavingOut = (id: string): SurveyTestStore => {
    const store = withStandardCell();
    setSketch(store, withAnchorIncluded(sketchOf(store)!, id, false)); // non-null: sketched
    return store;
  };

  test('is why Survey is refused, before it is pressed', async () => {
    const store = leavingOut('104');
    const page = pageOf(store);
    expect(page.leftOut).toEqual(['104']);
    expect(page.controls.canStart).toBe(false);
    expect(page.controls.startBlockedKey).toBe(LEFT_OUT_PROBLEM_KEY);

    await run(store, startRtlsSurvey(CELL));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('an anchor that is asleep or in standby may stay out', () => {
    for (const powerState of ['asleep', 'standby'] as const) {
      const store = leavingOut('104');
      store.dispatch(
        updateRtlsStats({ byId: { '104': { id: '104', powerState } } })
      );
      const page = pageOf(store);
      expect(page.leftOut).toEqual([]);
      expect(page.controls.canStart).toBe(true);
    }
  });

  test('so may one that is offline, which is not listed at all', () => {
    const store = leavingOut('104');
    reportAnchors(store, [
      ...FOUR_ANCHORS.slice(0, 3),
      { ...FOUR_ANCHORS[3], online: false },
    ]);
    expect(pageOf(store).leftOut).toEqual([]);
    expect(pageOf(store).anchors.map(({ id }) => id)).not.toContain('104');
  });

  test('it comes before what the sketch lacks, and goes with the tick', () => {
    const store = createSurveyTestStore();
    reportAnchors(
      store,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    setSketch(store, withAnchorIncluded(EMPTY_SKETCH, '103', false));
    expect(pageOf(store).controls.startBlockedKey).toBe(LEFT_OUT_PROBLEM_KEY);
    setSketch(store, withAnchorIncluded(sketchOf(store)!, '103', true)); // non-null: sketched
    expect(pageOf(store).controls.startBlockedKey).toBe(
      'rtlsSurvey.problem.pickOrigin'
    );
  });

  test('only operating anchors the sketch leaves out are named', () => {
    const anchors = anchorsAt(0, 1, 2).map((anchor, index) => ({
      ...anchor,
      operating: index !== 1,
    }));
    const sketch = { ...EMPTY_SKETCH, excluded: ['101', '102'] };
    expect(leftOutOperating(sketch, anchors).map(({ id }) => id)).toEqual([
      '102',
    ]);
  });
});

describe('2. about the same height', () => {
  test("each anchor's offset from its group is read when the server sends it", () => {
    const survey = mapRtlsSurvey({
      ...READY,
      fit: {
        ...(READY.fit as object),
        anchors: {
          '101': { x: 0, y: 0, z: 0.004, heightOffsetM: -0.004 },
          '102': { x: 4, y: 0, z: 0, heightOffsetM: 0 },
          // in no group
          '103': { x: 0, y: 3, z: -1.2, heightOffsetM: null },
          // a server that does not send it yet
          '104': { x: 4, y: 3, z: 0 },
        },
      },
    });
    const anchors = survey?.fit?.anchors ?? {};
    expect(anchors['101'].heightOffsetM).toBe(-0.004);
    expect(anchors['102'].heightOffsetM).toBe(0);
    expect(anchors['103'].heightOffsetM).toBeUndefined();
    expect(anchors['104'].heightOffsetM).toBeUndefined();
  });
});
