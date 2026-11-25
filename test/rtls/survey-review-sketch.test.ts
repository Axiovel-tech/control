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

import { setRtlsSurveySketch } from '~/features/rtls/survey';
import {
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { sketchFromBasis, surveyTarget } from '~/features/rtls/survey-frame';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  EMPTY_SKETCH,
  groupSize,
  isBlankSketch,
  planMarkers,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withAnchorMoved,
  withGroupAdded,
  withGroupRemoved,
  withOrigin,
  withStoredAsDefault,
  withXAxis,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';

import { reply } from './rtls-test-store';
import {
  push,
  READY,
  REFIT,
  RUN,
  RUN_CANCELLED,
  STATUS_IDLE,
} from './survey-recording';
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

/** What the last request sent. */
const sent = (): Record<string, unknown> =>
  sendMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;

/** Anchors 100 + slot, none storing a position. */
const anchorsAt = (...slots: number[]): RtlsSurveyAnchor[] =>
  slots.map((slot) => ({
    id: String(100 + slot),
    name: `RTLS anchor A${slot}`,
    slot,
  }));

/** A cell that was surveyed before: two tiers, 4 m by 3 m, 2.5 m apart. */
const SURVEYED: TestAnchor[] = [
  { id: 101, slot: 0, stored: { north: 0, east: 0, down: 0 } },
  { id: 102, slot: 1, stored: { north: 4, east: 0, down: 0.012 } },
  { id: 103, slot: 2, stored: { north: 0.002, east: 3, down: -0.004 } },
  { id: 104, slot: 3, stored: { north: 0.001, east: 0, down: -2.5 } },
];

describe('1. a height group can be removed', () => {
  const FOUR = anchorsAt(0, 1, 2, 3);
  const named = withGroupAdded(
    withGroupAdded(standardCellSketch(FOUR), 'Truss'),
    'Balcony'
  );
  // 102 on the truss (level 2), 103 on the balcony (level 3)
  const used = withAnchorGroup(withAnchorGroup(named, '102', 2), '103', 3);

  test('its anchors go back to Lower and the groups above move down', () => {
    const removed = withGroupRemoved(used, 2);
    expect(removed.groups).toEqual(['Balcony']);
    expect(removed.groupOf['102']).toBe(0);
    expect(removed.groupOf['103']).toBe(2);
    expect(groupSize(removed, 2)).toBe(1);
    // no longer the untouched standard cell
    expect(removed.standard).toBe(false);
  });

  test('Lower and Upper stay', () => {
    expect(withGroupRemoved(used, 0)).toBe(used);
    expect(withGroupRemoved(used, 1)).toBe(used);
    expect(withGroupRemoved(used, 9)).toBe(used);
  });

  test('a group with no members left goes away by itself', () => {
    const emptied = withAnchorGroup(used, '102', 1);
    expect(emptied.groups).toEqual(['Balcony']);
    // the balcony's anchor follows its group down
    expect(emptied.groupOf).toMatchObject({ '102': 1, '103': 2 });
  });

  test('a group still in use stays when one of two anchors leaves it', () => {
    const shared = withAnchorGroup(used, '101', 2);
    expect(withAnchorGroup(shared, '101', 0).groups).toEqual([
      'Truss',
      'Balcony',
    ]);
  });

  test('a group just added waits for its first anchor', () => {
    expect(named.groups).toEqual(['Truss', 'Balcony']);
    expect(withAnchorGroup(named, '101', 1).groups).toEqual([
      'Truss',
      'Balcony',
    ]);
  });

  test('what is sent names no group that was removed', () => {
    const frame = surveyTarget(withGroupRemoved(used, 3), FOUR)?.frame;
    expect(frame).toMatchObject({
      heightGroups: [[100, 101, 103], [102]],
      upper: [102],
    });
  });
});

describe('8. the frame and placement of the survey the server holds', () => {
  const ECHO = {
    frame: {
      origin: 101,
      xAxis: 102,
      heightGroups: [[101, 102, 103], [104]],
      upper: [104],
      yPositive: 103,
    },
    placement: {
      '101': { x: 0, y: 0 },
      '102': { x: 4, y: 0 },
      '103': { x: 0, y: 3 },
      '104': { x: 4.2, y: 2.9 },
    },
  };
  /** Another browser surveyed; this one drew nothing and stores nothing. */
  const otherBrowser = (): SurveyTestStore => {
    const store = createSurveyTestStore();
    reportAnchors(
      store,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    play(store, [push({ ...READY, ...ECHO })]);
    return store;
  };

  test('are what a client that drew nothing shows', () => {
    const page = pageOf(otherBrowser());
    expect(page.sketchRestored).toBe(true);
    expect(page.sketch).toMatchObject({
      origin: '101',
      xAxis: '102',
      yPositive: '103',
      groupOf: { '101': 0, '102': 0, '103': 0, '104': 1 },
      positions: {
        '102': { north: 4, east: 0 },
        '104': { north: 4.2, east: 2.9 },
      },
    });
  });

  test('so the held survey can be refitted: the sketch is the one of the fit', async () => {
    const store = otherBrowser();
    const page = pageOf(store);
    expect(page.controls.canRefit).toBe(true);
    expect(page.controls.canStart).toBe(true);
    expect(page.controls.startBlockedKey).toBeUndefined();
    expect(page.sketchChanged).toBe(false);

    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sent()).toEqual({
      type: 'X-RTLS-SURVEY',
      action: 'fit',
      ...ECHO,
    });
  });

  test("and surveyed again, after which the sketch is this client's own", async () => {
    const store = otherBrowser();
    expect(sketchOf(store)).toBeUndefined();
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    expect(sent()).toMatchObject({
      action: 'start',
      anchors: [101, 102, 103, 104],
      frame: ECHO.frame,
    });
    // the run it was taken from is gone: the frame must not go with it
    expect(sketchOf(store)).toMatchObject({ origin: '101', xAxis: '102' });
    play(store, RUN_CANCELLED.slice(1));
    expect(pageOf(store).controls.canStart).toBe(true);
  });

  test('a frame without a placement keeps its +y side', () => {
    const store = otherBrowser();
    play(store, [push({ ...READY, frame: ECHO.frame })]);
    const page = pageOf(store);
    expect(page.sketch.positions).toEqual({});
    expect(page.refitTarget).toEqual({
      anchors: [101, 102, 103, 104],
      frame: ECHO.frame,
    });
    expect(page.sketchChanged).toBe(false);
  });

  test('the first edit makes it the sketch of this client', () => {
    const store = otherBrowser();
    setSketch(store, withXAxis(pageOf(store).sketch, '103'));
    const page = pageOf(store);
    expect(page.sketchRestored).toBe(false);
    expect(page.sketch.origin).toBe('101');
    expect(page.sketchChanged).toBe(true);
  });

  test("a client's own sketch is not replaced by the echo", () => {
    const store = otherBrowser();
    setSketch(store, withOrigin(EMPTY_SKETCH, '104'));
    const page = pageOf(store);
    expect(page.sketchRestored).toBe(false);
    expect(page.sketch.origin).toBe('104');
  });

  test('only who is left out was touched: the frame is still taken', () => {
    const store = otherBrowser();
    setSketch(store, withAnchorIncluded(EMPTY_SKETCH, '104', false));
    const page = pageOf(store);
    expect(page.sketchRestored).toBe(true);
    expect(page.sketch.excluded).toEqual(['104']);
  });

  test('an online anchor the survey did not range starts left out', () => {
    const store = otherBrowser();
    reportAnchors(store, [
      ...FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot })),
      { id: 105, slot: 4 },
    ]);
    expect(pageOf(store).sketch.excluded).toEqual(['105']);
  });

  test('the groups come back lowest first, whatever order they were sent in', () => {
    const FOUR = anchorsAt(1, 2, 3, 4);
    const sketch = sketchFromBasis(
      {
        frame: {
          origin: 103,
          xAxis: 104,
          // the upper group first, and 102 in no group at all
          heightGroups: [[101], [103, 104]],
          upper: [101],
        },
      },
      FOUR
    );
    expect(sketch.groupOf).toEqual({
      // not called upper: not above the origin's group
      '102': 0,
      '103': 1,
      '104': 1,
      '101': 2,
    });
    // a group past Upper has no name of its own
    expect(sketch.groups).toEqual(['']);
    expect(isBlankSketch(sketch)).toBe(false);
  });

  test('a preset is the frame it stands for', () => {
    const EIGHT = anchorsAt(0, 1, 2, 3, 4, 5, 6, 7);
    expect(
      sketchFromBasis({ frame: { preset: 'two-tiers' } }, EIGHT)
    ).toMatchObject({
      origin: '100',
      xAxis: '101',
      yPositive: '102',
      groupOf: { '100': 0, '103': 0, '104': 1, '107': 1 },
    });
  });

  test('a drawing changed by hand says again which side +y is on', () => {
    const restored = sketchFromBasis(ECHO, anchorsAt(1, 2, 3, 4));
    expect(
      withAnchorMoved(restored, '103', { north: 0, east: -3 }).yPositive
    ).toBe(undefined);
    expect(withOrigin(restored, '102').yPositive).toBeUndefined();
    expect(withAnchorGroup(restored, '103', 1).yPositive).toBe('103');
  });
});

describe('9. a re-survey that is cancelled', () => {
  const cancelled = (): SurveyTestStore => {
    const store = createSurveyTestStore();
    reportAnchors(store, SURVEYED);
    play(store, RUN_CANCELLED);
    return store;
  };

  test('the page keeps showing what the anchors store', () => {
    const page = pageOf(cancelled());
    expect(page.survey).toMatchObject({ state: 'idle', reason: 'cancelled' });
    expect(page.survey?.fit).toBeUndefined();
    expect(page.stored.map(({ id }) => id)).toEqual([
      '101',
      '102',
      '103',
      '104',
    ]);
    expect(page.stored[3]).toMatchObject({
      stored: { north: 0.001, east: 0 },
      storedDown: -2.5,
      surveyId: 12,
    });
  });

  test('the same while a new run measures, and after one failed', () => {
    const store = createSurveyTestStore();
    reportAnchors(store, SURVEYED);
    play(store, RUN.slice(0, 2));
    expect(pageOf(store).survey?.state).toBe('measuring');
    expect(pageOf(store).stored).toHaveLength(4);
  });

  test('the markers are where the anchors store themselves', () => {
    const { anchors, sketch } = pageOf(cancelled());
    expect(planMarkers(sketch, anchors)['102']).toEqual({
      point: { north: 4, east: 0 },
      known: true,
    });
  });

  test('an anchor that stores nothing is not listed', () => {
    const store = createSurveyTestStore();
    play(store, RUN_CANCELLED);
    // the fourth test anchor stores no position
    expect(pageOf(store).stored.map(({ id }) => id)).toEqual([
      '101',
      '102',
      '103',
    ]);
  });
});

describe('what the anchors store is where a sketch starts', () => {
  const surveyed = (): SurveyTestStore => {
    const store = createSurveyTestStore();
    reportAnchors(store, SURVEYED);
    play(store, [STATUS_IDLE]);
    return store;
  };

  test('the height groups their stored heights fall into', () => {
    expect(pageOf(surveyed()).sketch.groupOf).toEqual({
      '101': 0,
      '102': 0,
      '103': 0,
      '104': 1,
    });
  });

  test('and the frame they were committed in, so Survey is on offer', async () => {
    const store = surveyed();
    const page = pageOf(store);
    // 104 stands right above the origin: the one at height 0 is the origin
    expect(page.sketch).toMatchObject({ origin: '101', xAxis: '102' });
    expect(page.controls.canStart).toBe(true);

    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    // no placement: the server starts from the stored positions
    expect(sent()).toEqual({
      type: 'X-RTLS-SURVEY',
      action: 'start',
      anchors: [101, 102, 103, 104],
      frame: {
        origin: 101,
        xAxis: 102,
        heightGroups: [[101, 102, 103], [104]],
        upper: [104],
        yPositive: 103,
      },
    });
  });

  test('positions that single out no frame leave it to the operator', () => {
    const anchors = (stored: Array<[number, number, number]>) =>
      stored.map(
        ([north, east, down], slot): RtlsSurveyAnchor => ({
          id: String(101 + slot),
          name: `A${slot}`,
          slot,
          stored: { north, east },
          storedDown: down,
        })
      );
    // nobody at the origin
    expect(
      withStoredAsDefault(
        EMPTY_SKETCH,
        anchors([
          [1, 1, 0],
          [4, 0, 0],
        ])
      ).origin
    ).toBeUndefined();
    // two candidates for +x
    const two = withStoredAsDefault(
      EMPTY_SKETCH,
      anchors([
        [0, 0, 0],
        [4, 0, 0],
        [8, 0, 0],
      ])
    );
    expect(two.origin).toBe('101');
    expect(two.xAxis).toBeUndefined();
    // nothing stored at all
    const none = withStoredAsDefault(EMPTY_SKETCH, anchorsAt(0, 1));
    expect(none.origin).toBeUndefined();
    expect(none.groupOf).toEqual({});
  });

  test("the operator's own groups and frame stay as they are", () => {
    const store = surveyed();
    const own = withAnchorGroup(withOrigin(EMPTY_SKETCH, '103'), '102', 1);
    setSketch(store, own);
    expect(pageOf(store).sketch).toMatchObject({
      origin: '103',
      groupOf: { '102': 1 },
    });
    expect(pageOf(store).sketch.xAxis).toBeUndefined();
    // and so does an untouched standard cell
    const standard = standardCellSketch(pageOf(store).anchors);
    expect(withStoredAsDefault(standard, pageOf(store).anchors)).toBe(standard);
  });
});
