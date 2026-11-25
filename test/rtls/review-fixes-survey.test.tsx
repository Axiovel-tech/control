import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

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

import { updateRtlsStats } from '~/features/rtls/slice';
import {
  acknowledgeRtlsSurveyWarnings,
  setRtlsSurveySketch,
  surveyControls,
  warningsSignature,
} from '~/features/rtls/survey';
import {
  commitRtlsSurvey,
  refitRtlsSurvey,
  startRtlsSurvey,
} from '~/features/rtls/survey-actions';
import { getRtlsSurveyPage } from '~/features/rtls/survey-selectors';
import {
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withXAxis,
} from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';
import SurveyAnchorList from '~/views/rtls/survey/SurveyAnchorList';
import SurveyCommit from '~/views/rtls/survey/SurveyCommit';
import SurveyRun from '~/views/rtls/survey/SurveyRun';

import { reply } from './rtls-test-store';
import {
  answer,
  COMMIT,
  push,
  READY,
  REFIT,
  RUN,
  STATUS_IDLE,
} from './survey-recording';
import {
  acknowledge,
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

/** A3 for 104, as the mocked `t` renders the slot label. */
const nameOf = (id: string): string => `A${Number(id) - 101}`;

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

describe('1. a fit that is stale against the sketch cannot be committed', () => {
  /** The standard cell surveyed, its warnings acknowledged. */
  const committable = (): SurveyTestStore => {
    const store = withStandardCell();
    play(store, [ready()]);
    acknowledge(store);
    return store;
  };

  test('Commit is on offer while the sketch is the one of the fit', () => {
    const { controls, sketchChanged } = pageOf(committable());
    expect(sketchChanged).toBe(false);
    expect(controls.canCommit).toBe(true);
  });

  test('a frame edit takes it away, with the reason at the button', async () => {
    const store = committable();
    setSketch(store, withXAxis(pageOf(store).sketch, '103'));
    const page = pageOf(store);
    expect(page.sketchChanged).toBe(true);
    expect(page.controls.commitOffered).toBe(true);
    expect(page.controls.canCommit).toBe(false);
    expect(page.controls.commitBlockedKey).toBe('rtlsSurvey.commit.refitFirst');
    // the operator refits first
    expect(page.controls.canRefit).toBe(true);

    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).not.toHaveBeenCalled();

    const markup = renderToStaticMarkup(
      <SurveyCommit
        survey={page.survey!} // non-null: the fit is held
        controls={page.controls}
        offline={[]}
        locked={false}
        nameOf={nameOf}
        onCommit={noop}
        onLock={noop}
      />
    );
    expect(markup).toContain('data-testid="rtls-survey-commit-blocked"');
    expect(markup).toContain('rtlsSurvey.commit.refitFirst');
  });

  test('so does a change of a height group', () => {
    const store = committable();
    setSketch(store, withAnchorGroup(pageOf(store).sketch, '104', 1));
    expect(pageOf(store).controls.canCommit).toBe(false);
  });

  test('the refit brings it back, for the fit the refit gave', async () => {
    const store = committable();
    setSketch(store, withXAxis(pageOf(store).sketch, '103'));
    const refitted = pageOf(store).refitTarget;
    sendMessage.mockResolvedValueOnce(
      reply({
        ...REFIT.body,
        survey: {
          ...(REFIT.body.survey as object),
          frame: refitted?.frame,
          placement: refitted?.placement,
        },
      })
    );
    await run(store, refitRtlsSurvey(CELL));
    expect(pageOf(store).sketchChanged).toBe(false);
    expect(pageOf(store).controls.canCommit).toBe(true);
  });

  test('a stale fit is named before its gate, which is of the old sketch', () => {
    expect(
      surveyControls({
        survey: heldOf(committable()),
        acknowledged: false,
        fitStale: true,
      }).commitBlockedKey
    ).toBe('rtlsSurvey.commit.refitFirst');
  });
});

describe('2. a commit is of the survey on screen', () => {
  test('it carries the revision the page shows', async () => {
    const store = withStandardCell();
    play(store, [ready(7)]);
    acknowledge(store);
    sendMessage.mockResolvedValueOnce(reply(COMMIT[2].body));
    await run(store, commitRtlsSurvey(CELL));
    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'X-RTLS-SURVEY',
        action: 'commit',
        acknowledgeWarnings: true,
        revision: 7,
      },
      { timeout: 30 }
    );
  });

  test('the acknowledged retry carries the same revision', async () => {
    const store = withStandardCell();
    play(store, [ready(7)]);
    // a commit of this client's that the server answers with the warnings:
    // such an answer does not raise the revision
    play(store, [
      answer('commit', 'warnings', {
        ...READY,
        frame: STANDARD_FRAME,
        revision: 7,
      }),
    ]);
    expect(heldOf(store)?.revision).toBe(7);
    expect(pageOf(store).controls.canCommit).toBe(false);

    acknowledge(store);
    sendMessage.mockResolvedValueOnce(reply(COMMIT[2].body));
    await run(store, commitRtlsSurvey(CELL));
    expect(sent()).toEqual({
      type: 'X-RTLS-SURVEY',
      action: 'commit',
      acknowledgeWarnings: true,
      revision: 7,
    });
  });

  test('a server that sends no revision is sent none', async () => {
    const store = withStandardCell();
    play(store, [ready()]);
    acknowledge(store);
    sendMessage.mockResolvedValueOnce(reply(COMMIT[2].body));
    await run(store, commitRtlsSurvey(CELL));
    expect(sent()).not.toHaveProperty('revision');
  });

  /** The server refused the commit: its survey moved on to another fit. */
  const refusedAsStale = async (): Promise<SurveyTestStore> => {
    const store = withStandardCell();
    play(store, [ready(7)]);
    acknowledge(store);
    const moved = answer(
      'commit',
      'refused',
      {
        ...READY,
        frame: STANDARD_FRAME,
        revision: 9,
        fit: { ...(READY.fit as object), rmsM: 0.012 },
      },
      'stale'
    );
    sendMessage.mockResolvedValueOnce(reply(moved.body));
    await run(store, commitRtlsSurvey(CELL));
    return store;
  };

  test("a stale refusal shows the server's state as it is now", async () => {
    const store = await refusedAsStale();
    expect(heldOf(store)).toMatchObject({ revision: 9, state: 'ready' });
    expect(heldOf(store)?.fit?.rmsM).toBe(0.012);
    expect(store.getState().rtlsSurvey.outcome).toMatchObject({
      result: 'refused',
      reason: 'stale',
    });
  });

  test('and one line saying that the survey changed meanwhile', async () => {
    const store = await refusedAsStale();
    const { outcome } = store.getState().rtlsSurvey;
    const page = pageOf(store);
    const markup = renderToStaticMarkup(
      <SurveyRun
        survey={page.survey}
        controls={page.controls}
        outcome={outcome}
        leftOut={[]}
        hintKeys={[]}
        sketchChanged={false}
        nameOf={nameOf}
        onStart={noop}
        onCancel={noop}
        onRefit={noop}
      />
    );
    expect(markup).toContain('data-result="refused"');
    expect(markup).toContain('rtlsSurvey.outcome.stale');
    // the server's code word is not what the operator reads
    expect(markup).not.toContain('>stale<');
  });

  test('the acknowledgement was for the fit it replaced: it is gone', async () => {
    const store = await refusedAsStale();
    expect(pageOf(store).acknowledged).toBe(false);
    expect(pageOf(store).controls.canCommit).toBe(false);
  });

  test('the same warnings on another fit are not acknowledged', () => {
    const store = withStandardCell();
    play(store, [ready(7)]);
    const shown = warningsSignature(heldOf(store));
    play(store, [ready(8, { fit: { ...(READY.fit as object), rmsM: 0.012 } })]);
    // the tick lands after the other fit arrived: it was for what was shown
    store.dispatch(acknowledgeRtlsSurveyWarnings(shown));
    expect(pageOf(store).acknowledged).toBe(false);
    acknowledge(store);
    expect(pageOf(store).acknowledged).toBe(true);
  });
});

describe('4. the include boxes while a measurement or fit is held', () => {
  /** The fit of the four anchors held; a fifth anchor online beside them. */
  const held = (): SurveyTestStore => {
    const store = withStandardCell();
    reportAnchors(store, [...FOUR_ANCHORS, { id: 105, slot: 4 }]);
    play(store, [ready()]);
    return store;
  };

  test('show the measured group, whatever was ticked', () => {
    const store = held();
    expect(pageOf(store).groupFixed).toBe(true);
    // 105 was not measured: it is shown out
    expect(pageOf(store).sketch.excluded).toEqual(['105']);

    setSketch(store, withAnchorIncluded(sketchOf(store)!, '104', false)); // non-null: sketched
    const page = pageOf(store);
    expect(page.sketch.excluded).toEqual(['105']);
    // and what Refit sends is that group: no anchor silently stays in
    expect(page.refitTarget?.anchors).toEqual([101, 102, 103, 104]);
    expect(page.sketchChanged).toBe(false);
  });

  test('cannot be changed, and say so', () => {
    const render = (groupFixed: boolean): string =>
      renderToStaticMarkup(
        <SurveyAnchorList
          anchors={pageOf(held()).anchors}
          sketch={pageOf(held()).sketch}
          leftOut={[]}
          restored={false}
          groupFixed={groupFixed}
          onChange={noop}
        />
      );
    const boxes = (markup: string): string[] =>
      [...markup.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map(
        ([input]) => input
      );
    expect(boxes(render(true))).toHaveLength(5);
    expect(boxes(render(true)).every((box) => box.includes('disabled'))).toBe(
      true
    );
    expect(render(true)).toContain('data-testid="rtls-survey-group-fixed"');
    expect(render(true)).toContain('rtlsSurvey.list.groupFixed');

    expect(boxes(render(false)).some((box) => box.includes('disabled'))).toBe(
      false
    );
    expect(render(false)).not.toContain('rtls-survey-group-fixed');
  });

  test('are fixed while the run measures, and free once it is committed', () => {
    const store = withStandardCell();
    play(store, RUN.slice(0, 2));
    expect(pageOf(store).groupFixed).toBe(true);
    play(store, [ready()]);
    play(store, COMMIT);
    expect(heldOf(store)?.state).toBe('committed');
    expect(pageOf(store).groupFixed).toBe(false);
  });

  test('are free with no survey, and with one of another cell', () => {
    const store = withStandardCell();
    play(store, [STATUS_IDLE]);
    expect(pageOf(store).groupFixed).toBe(false);
    setSketch(store, withAnchorIncluded(sketchOf(store)!, '104', false)); // non-null: sketched
    expect(pageOf(store).sketch.excluded).toEqual(['104']);
  });

  test('a new survey takes the anchors that are operating then', async () => {
    const store = held();
    // 104 was measured and has gone to sleep; 105 was not and ranges
    store.dispatch(
      updateRtlsStats({
        byId: { '104': { id: '104', powerState: 'asleep' } },
      })
    );
    const page = pageOf(store);
    expect(page.leftOut).toEqual([]);
    expect(page.controls.canStart).toBe(true);
    expect(page.startTarget?.anchors).toEqual([101, 102, 103, 105]);

    sendMessage.mockResolvedValueOnce(reply(RUN[0].body));
    await run(store, startRtlsSurvey(CELL));
    expect(sent()).toMatchObject({
      action: 'start',
      anchors: [101, 102, 103, 105],
    });
  });
});
