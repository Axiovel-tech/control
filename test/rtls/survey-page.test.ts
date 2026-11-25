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
  commitRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import {
  getRtlsSurveyCells,
  getRtlsSurveyPage,
} from '~/features/rtls/survey-selectors';
import {
  EMPTY_SKETCH,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorMoved,
  withXAxis,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';

import { reply } from './rtls-test-store';
import { answer, push, READY, REFIT, RUN } from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
  run,
  stateOf,
  surveyOf,
  type SurveyTestStore,
  type TestAnchor,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

beforeEach(() => {
  sendMessage.mockReset();
});

const pageOf = (store: SurveyTestStore, cell = CELL) =>
  getRtlsSurveyPage(stateOf(store), cell);

const sketchCell = (
  store: SurveyTestStore,
  cell: string,
  sketch?: RtlsSurveySketch
): void => {
  store.dispatch(
    setRtlsSurveySketch({
      cell,
      sketch:
        sketch ??
        standardCellSketch(getRtlsSurveyCells(stateOf(store))[cell] ?? []),
    })
  );
};

/** The frame of the last request sent. */
const sentFrame = (): unknown =>
  (sendMessage.mock.calls.at(-1)?.[0] as { frame?: unknown }).frame;

describe('a survey held for another cell', () => {
  const STAGE = 'stage';
  const TWO_CELLS: TestAnchor[] = [
    ...FOUR_ANCHORS,
    ...[201, 202, 203, 204].map((id, slot) => ({ id, slot, cell: STAGE })),
  ];

  /** The bench cell surveyed and ready, the stage cell sketched. */
  const benchSurveyed = (): SurveyTestStore => {
    const store = createSurveyTestStore();
    reportAnchors(store, TWO_CELLS);
    sketchCell(store, CELL);
    sketchCell(store, STAGE);
    play(store, RUN);
    acknowledge(store);
    return store;
  };

  test('its own cell shows the fit and offers the commit', () => {
    const page = pageOf(benchSurveyed());
    expect(page.heldElsewhere).toBe(false);
    expect(page.survey?.fit).toBeDefined();
    expect(page.controls).toMatchObject({
      commitOffered: true,
      canCommit: true,
      canRefit: true,
    });
  });

  test('the other cell shows no fit, no gate and no commit, and says why', () => {
    const page = pageOf(benchSurveyed(), STAGE);
    expect(page.anchors.map(({ id }) => id)).toEqual([
      '201',
      '202',
      '203',
      '204',
    ]);
    expect(page.heldElsewhere).toBe(true);
    expect(page.survey).toBeUndefined();
    expect(page.measured).toEqual([]);
    expect(page.sketchChanged).toBe(false);
    expect(page.controls).toMatchObject({
      commitOffered: false,
      canCommit: false,
      canRefit: false,
      canCancel: false,
      // a survey of this cell replaces the held one
      canStart: true,
    });
  });

  test('Commit and Refit from the other cell send nothing', async () => {
    const store = benchSurveyed();
    await run(store, commitRtlsSurvey(STAGE, surveyOf(store)));
    await run(store, refitRtlsSurvey(STAGE));
    expect(sendMessage).not.toHaveBeenCalled();

    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  test('a run of the other cell cannot be cancelled or doubled from here', () => {
    const store = benchSurveyed();
    play(store, RUN.slice(0, 2));
    expect(pageOf(store, STAGE).controls).toMatchObject({
      canCancel: false,
      canStart: false,
      startBlockedKey: 'rtlsSurvey.refusal.running',
    });
    expect(pageOf(store).controls.canCancel).toBe(true);
  });

  test('a survey of the other cell starts with its own anchors', async () => {
    const store = benchSurveyed();
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(STAGE));
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      action: 'start',
      anchors: [201, 202, 203, 204],
    });
  });

  test("a survey spread over two cells is neither cell's", () => {
    const store = benchSurveyed();
    play(store, [push({ ...READY, anchors: [101, 102, 201, 202] })]);
    expect(pageOf(store).heldElsewhere).toBe(true);
    expect(pageOf(store, STAGE).heldElsewhere).toBe(true);
  });

  test('a state without anchors belongs to nobody', () => {
    const store = createSurveyTestStore();
    reportAnchors(store, TWO_CELLS);
    play(store, [push({ state: 'idle', anchors: [], reason: 'cancelled' })]);
    expect(pageOf(store, STAGE)).toMatchObject({
      heldElsewhere: false,
      survey: { state: 'idle', reason: 'cancelled' },
    });
  });
});

describe('an anchor of the survey that went offline', () => {
  const EIGHT: TestAnchor[] = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({
    id: 101 + slot,
    slot,
  }));
  const GROUP = EIGHT.map(({ id }) => id);

  /** The fit of the recorded run, for eight anchors. */
  const ready = { ...READY, anchors: GROUP };

  /** Two tiers by hand: A4..A7 upper, drawn as a rectangle. */
  const byHand = (): RtlsSurveySketch => {
    let sketch: RtlsSurveySketch = {
      ...EMPTY_SKETCH,
      origin: '101',
      xAxis: '102',
    };
    for (const { id, slot } of EIGHT) {
      sketch = withAnchorMoved(sketch, String(id), {
        north: slot % 2 === 1 ? 6 : 0,
        east: slot % 4 >= 2 ? 4 : 0,
      });
      sketch = withAnchorGroup(sketch, String(id), slot >= 4 ? 1 : 0);
    }
    return sketch;
  };

  const surveyed = (sketch?: RtlsSurveySketch): SurveyTestStore => {
    const store = createSurveyTestStore();
    reportAnchors(store, EIGHT);
    sketchCell(store, CELL, sketch);
    play(store, [answer('start', 'started', ready), push(ready)]);
    acknowledge(store);
    return store;
  };

  const without = (slot: number): TestAnchor[] =>
    EIGHT.map((anchor) =>
      anchor.slot === slot ? { ...anchor, online: false } : anchor
    );

  test('Refit still names the eight measured anchors, each in its height group', async () => {
    const store = surveyed(byHand());
    reportAnchors(store, without(5));
    const page = pageOf(store);
    expect(page.anchors).toHaveLength(7);
    expect(page.measured.map(({ id }) => id)).toEqual(GROUP.map(String));
    expect(page.offline).toEqual(['106']);
    expect(page.controls.canRefit).toBe(true);

    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sentFrame()).toMatchObject({
      heightGroups: [
        [101, 102, 103, 104],
        [105, 106, 107, 108],
      ],
      upper: [105, 106, 107, 108],
    });
    expect(
      Object.keys(
        (sendMessage.mock.calls[0][0] as { placement: object }).placement
      )
    ).toHaveLength(8);
  });

  test('a standard cell still refits as the preset the server measured', async () => {
    const store = surveyed();
    reportAnchors(store, without(3));
    expect(pageOf(store).sketch.groupOf).toMatchObject({ '104': 0, '108': 1 });
    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sentFrame()).toEqual({ preset: 'two-tiers' });
  });

  test('an anchor that joined the standard cell late keeps its tier when it drops out', async () => {
    const store = createSurveyTestStore();
    reportAnchors(store, EIGHT.slice(0, 4));
    sketchCell(store, CELL);
    // A4..A7 come online after "Standard cell": nothing is stored for them
    reportAnchors(store, EIGHT);
    play(store, [answer('start', 'started', ready), push(ready)]);
    reportAnchors(store, without(5));

    expect(pageOf(store).sketch.groupOf['106']).toBe(1);
    sendMessage.mockResolvedValueOnce(reply(REFIT.body));
    await run(store, refitRtlsSurvey(CELL));
    expect(sentFrame()).toEqual({ preset: 'two-tiers' });
  });

  test('the commit waits for a new survey, and says so', async () => {
    const store = surveyed(byHand());
    expect(pageOf(store).controls.canCommit).toBe(true);
    reportAnchors(store, without(5));
    expect(pageOf(store).controls).toMatchObject({
      commitOffered: true,
      canCommit: false,
      commitBlockedKey: 'rtlsSurvey.commit.surveyAgain',
    });
    await run(store, commitRtlsSurvey(CELL, surveyOf(store)));
    expect(sendMessage).not.toHaveBeenCalled();
  });

  test('a new survey takes the anchors that are online', () => {
    const store = surveyed(byHand());
    reportAnchors(store, without(5));
    expect(pageOf(store).startTarget?.anchors).toEqual([
      101, 102, 103, 104, 105, 107, 108,
    ]);
  });
});

describe('a standard cell and an anchor that comes online later', () => {
  const upTo = (slots: number): TestAnchor[] =>
    Array.from({ length: slots }, (_, slot) => ({ id: 101 + slot, slot }));

  test('the row shows the group the preset gives the late anchor', async () => {
    const store = createSurveyTestStore();
    reportAnchors(store, upTo(4));
    sketchCell(store, CELL);
    reportAnchors(store, upTo(5));

    const page = pageOf(store);
    expect(page.sketch.groupOf['105']).toBe(1);
    expect(page.sketch.standard).toBe(true);
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      anchors: [101, 102, 103, 104, 105],
      frame: { preset: 'two-tiers' },
    });
  });

  test("an edit of the late anchor's row starts from what was shown", () => {
    const store = createSurveyTestStore();
    reportAnchors(store, upTo(4));
    sketchCell(store, CELL);
    reportAnchors(store, upTo(6));
    // the operator moves A5 down; A4 stays upper, as its row said
    sketchCell(store, CELL, withAnchorGroup(pageOf(store).sketch, '106', 0));
    expect(pageOf(store).startTarget?.frame).toMatchObject({
      heightGroups: [[101, 102, 103, 104, 106], [105]],
      upper: [105],
    });
  });
});

describe('the sketch against the fit the server holds', () => {
  const surveyedBy = async (store: SurveyTestStore): Promise<void> => {
    sketchCell(store, CELL);
    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    play(store, RUN.slice(1));
  };

  test('the echo says the sketch is the one of the fit, also to a client that did not ask', () => {
    const store = createSurveyTestStore();
    sketchCell(store, CELL);
    // another client surveyed; this one only hears of it
    play(store, [push({ ...READY, frame: { preset: 'two-tiers' } })]);
    expect(store.getState().rtlsSurvey.fittedRequest).toBeUndefined();
    expect(pageOf(store).sketchChanged).toBe(false);

    sketchCell(store, CELL, withXAxis(pageOf(store).sketch, '103'));
    expect(pageOf(store).sketchChanged).toBe(true);
  });

  test('the echo wins over what this client remembers', async () => {
    const store = createSurveyTestStore();
    await surveyedBy(store);
    expect(pageOf(store).sketchChanged).toBe(false);
    // another client refitted with A2 on +x
    play(store, [
      push({
        ...READY,
        frame: {
          origin: 101,
          xAxis: 103,
          heightGroups: [[101, 102, 103, 104]],
          upper: [],
          yPositive: 102,
        },
      }),
    ]);
    expect(pageOf(store).sketchChanged).toBe(true);
  });

  test('without an echo the remembered request is what the fit was made with', async () => {
    const store = createSurveyTestStore();
    await surveyedBy(store);
    expect(pageOf(store).fitBasis).toMatchObject({
      frame: { preset: 'two-tiers' },
    });
    sketchCell(store, CELL, withXAxis(pageOf(store).sketch, '103'));
    expect(pageOf(store).sketchChanged).toBe(true);
  });
});
