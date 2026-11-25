/**
 * @file The survey page of one cell, worked out from the store: which
 * anchors it lists, the sketch as shown, whether the survey the server holds
 * is this cell's, and what may be sent now. The panel renders it and the
 * thunks check it again before they send, so both go by the same answer.
 */

import {
  type RtlsSurveyControls,
  type RtlsSurveySliceState,
  surveyControls,
  warningsSignature,
} from './survey';
import {
  fitSignature,
  type RtlsSurveyFitBasis,
  type RtlsSurveyTarget,
  sketchFromBasis,
  sketchHintKeys,
  sketchProblemKey,
  surveyTarget,
} from './survey-frame';
import { type RtlsSurvey } from './survey-messages';
import {
  EMPTY_SKETCH,
  isBlankSketch,
  leftOutOperating,
  resolveSketch,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  surveyGroup,
  withStoredAsDefault,
} from './survey-sketch';

/** Why Survey is refused while an operating anchor of the cell is left out. */
export const LEFT_OUT_PROBLEM_KEY = 'rtlsSurvey.problem.leftOut';

export type RtlsSurveyPage = {
  /** The online anchors of the cell, in slot order. */
  anchors: RtlsSurveyAnchor[];
  /** The sketch as shown and sent (`resolveSketch`). */
  sketch: RtlsSurveySketch;
  /**
   * The sketch is the frame and placement of the survey the server holds:
   * this client drew none of its own for the cell.
   */
  sketchRestored: boolean;
  /**
   * The operating anchors of the cell the sketch leaves out: the server
   * refuses to survey beside them.
   */
  leftOut: string[];
  /**
   * The anchors of the cell that store a position, in slot order: what the
   * page shows while the server holds no fit of the cell (never surveyed
   * from here, a run cancelled or failed, a run in progress).
   */
  stored: RtlsSurveyAnchor[];
  /**
   * The survey the server holds, when it is this cell's or nobody's;
   * `undefined` while it holds one of another cell (`heldElsewhere`).
   */
  survey?: RtlsSurvey;
  heldElsewhere: boolean;
  /** The anchors the held survey measured, online or not. */
  measured: RtlsSurveyAnchor[];
  /** Those of them that are offline now. */
  offline: string[];
  /** The warnings now shown are acknowledged. */
  acknowledged: boolean;
  controls: RtlsSurveyControls;
  /** What Survey sends; `undefined` while the sketch lacks something. */
  startTarget?: RtlsSurveyTarget;
  /** What Refit sends, for the measured anchors. */
  refitTarget?: RtlsSurveyTarget;
  /** The frame and placement the held fit was made with, as far as known. */
  fitBasis?: RtlsSurveyFitBasis;
  /** The sketch moved on since the fit on screen. */
  sketchChanged: boolean;
  hintKeys: string[];
};

/**
 * The cell that owns the anchors a survey measured: the one cell their
 * online members are in. `undefined` when they are spread over cells or all
 * offline.
 */
const ownerOf = (
  measured: readonly string[],
  cells: Record<string, RtlsSurveyAnchor[]>
): string | undefined => {
  const owners = Object.keys(cells).filter((key) =>
    cells[key].some(({ id }) => measured.includes(id))
  );
  return owners.length === 1 ? owners[0] : undefined;
};

/**
 * Works out the page of `cell`. `cells` are the online anchors per cell,
 * `known` every anchor the server lists, online or not, and `refusalKey`
 * why neither Survey nor Commit may be sent (`surveyRefusalKey`).
 */
export function surveyPage(
  slice: RtlsSurveySliceState,
  cells: Record<string, RtlsSurveyAnchor[]>,
  known: readonly RtlsSurveyAnchor[],
  refusalKey: string | undefined,
  cell: string
): RtlsSurveyPage {
  const anchors = cells[cell] ?? [];
  const held = slice.survey;
  const measuredIds = held?.anchors ?? [];
  const heldElsewhere =
    measuredIds.length > 0 && ownerOf(measuredIds, cells) !== cell;
  const survey = heldElsewhere ? undefined : held;

  // the anchors as measured: one that went offline since is still of the fit
  const measured = (survey?.anchors ?? []).map(
    (id) => known.find((anchor) => anchor.id === id) ?? { id, name: id }
  );
  const online = new Set(
    Object.values(cells).flatMap((c) => c.map((a) => a.id))
  );
  const offline = measured.map(({ id }) => id).filter((id) => !online.has(id));

  // a client that drew nothing of this cell takes the frame and placement
  // the server echoes for the survey it holds: the survey of another
  // browser, or of this one before a reload, can then be refitted and run
  // again
  const own = slice.sketches[cell];
  const sketchRestored =
    isBlankSketch(own) && survey?.basis !== undefined && measured.length > 0;
  const restored =
    sketchRestored && survey?.basis !== undefined
      ? sketchFromBasis(survey.basis, measured)
      : undefined;
  const drawn =
    restored !== undefined
      ? {
          ...restored,
          // once committed, where the anchors are is what they store
          positions: survey?.state === 'committed' ? {} : restored.positions,
          excluded:
            own?.excluded ??
            anchors
              .map(({ id }) => id)
              .filter((id) => !measuredIds.includes(id)),
        }
      : (own ?? EMPTY_SKETCH);
  const sketch = resolveSketch(withStoredAsDefault(drawn, anchors), [
    ...anchors,
    ...measured.filter(({ id }) => !online.has(id)),
  ]);
  const group = surveyGroup(sketch, anchors);
  const leftOut = leftOutOperating(sketch, anchors).map(({ id }) => id);
  const refitTarget =
    survey?.fit === undefined ? undefined : surveyTarget(sketch, measured);
  const fitBasis = survey?.basis ?? slice.fittedRequest;
  const acknowledged =
    slice.acknowledged !== undefined &&
    slice.acknowledged === warningsSignature(survey);

  return {
    anchors,
    sketch,
    sketchRestored,
    leftOut,
    stored: anchors.filter(({ stored }) => stored !== undefined),
    survey,
    heldElsewhere,
    measured,
    offline,
    acknowledged,
    controls: surveyControls({
      survey: held,
      pending: slice.pending,
      available: slice.available,
      acknowledged,
      refusalKey,
      startProblemKey:
        leftOut.length > 0
          ? LEFT_OUT_PROBLEM_KEY
          : sketchProblemKey(sketch, group),
      refitProblemKey: sketchProblemKey(sketch, measured),
      elsewhere: heldElsewhere,
      groupOffline: offline.length > 0,
    }),
    startTarget: surveyTarget(sketch, group),
    refitTarget,
    fitBasis,
    sketchChanged:
      survey?.state === 'ready' &&
      refitTarget !== undefined &&
      fitBasis !== undefined &&
      fitSignature(refitTarget, refitTarget.anchors) !==
        fitSignature(fitBasis, refitTarget.anchors),
    hintKeys: sketchHintKeys(sketch, group),
  };
}
