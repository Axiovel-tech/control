/**
 * @file The survey page of one cell, worked out from the store: which
 * anchors it lists, the sketch as shown, whether the survey the server holds
 * is this cell's, and what may be sent now. The panel renders it and the
 * thunks check it again before they send, so both go by the same answer.
 */

import {
  anchorsLeftBehind,
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
import { type RtlsSurvey, type RtlsSurveyPhase } from './survey-messages';
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

/** The phases in which the server holds a measurement, or takes one. */
const HOLDING_PHASES: readonly RtlsSurveyPhase[] = [
  'measuring',
  'returning',
  'ready',
  'committing',
];

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
   * The include boxes show the measured group and cannot be changed: a
   * refit and a commit are of the anchors that were measured, whatever is
   * ticked. A new survey takes the anchors that are operating then.
   */
  groupFixed: boolean;
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
  /** The sketch moved on since the fit on screen, which is not being retried. */
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
 * The sketch of a cell as shown and sent. A client that drew nothing of the
 * cell takes the frame and placement the server echoes for the survey it
 * holds (`sketchRestored`): the survey of another browser, or of this one
 * before a reload, can then be refitted and run again. While the group is
 * fixed, who is left out is who was not measured. `anchors` are the online
 * anchors of the cell and `measured` those of the held survey.
 */
function shownSketch({
  own,
  survey,
  anchors,
  measured,
  groupFixed,
}: {
  own: RtlsSurveySketch | undefined;
  survey: RtlsSurvey | undefined;
  anchors: readonly RtlsSurveyAnchor[];
  measured: readonly RtlsSurveyAnchor[];
  groupFixed: boolean;
}): { sketch: RtlsSurveySketch; sketchRestored: boolean } {
  const basis =
    isBlankSketch(own) && measured.length > 0 ? survey?.basis : undefined;
  const restored =
    basis === undefined ? undefined : sketchFromBasis(basis, measured);
  const notMeasured = anchors
    .map(({ id }) => id)
    .filter((id) => !measured.some((anchor) => anchor.id === id));
  const chosen =
    restored === undefined
      ? (own ?? EMPTY_SKETCH)
      : {
          ...restored,
          // once committed, where the anchors are is what they store
          positions: survey?.state === 'committed' ? {} : restored.positions,
          excluded: own?.excluded ?? notMeasured,
        };
  const drawn = groupFixed ? { ...chosen, excluded: notMeasured } : chosen;
  return {
    sketch: resolveSketch(withStoredAsDefault(drawn, anchors), [
      ...anchors,
      // one that went offline since is still of the fit
      ...measured.filter(
        ({ id }) => !anchors.some((anchor) => anchor.id === id)
      ),
    ]),
    sketchRestored: restored !== undefined,
  };
}

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

  const groupFixed =
    survey !== undefined &&
    measured.length > 0 &&
    HOLDING_PHASES.includes(survey.state);
  const { sketch, sketchRestored } = shownSketch({
    own: slice.sketches[cell],
    survey,
    anchors,
    measured,
    groupFixed,
  });
  // while the boxes are fixed a new survey takes the anchors the server
  // requires, so that one that went to sleep or woke up since the
  // measurement does not leave Survey without a way to be sent
  const group = groupFixed
    ? anchors.filter(({ operating }) => operating === true)
    : surveyGroup(sketch, anchors);
  const leftOut = groupFixed
    ? []
    : leftOutOperating(sketch, anchors).map(({ id }) => id);
  const refitTarget =
    survey?.fit === undefined ? undefined : surveyTarget(sketch, measured);
  const fitBasis = survey?.basis ?? slice.fittedRequest;
  const acknowledged =
    slice.acknowledged !== undefined &&
    slice.acknowledged === warningsSignature(survey);
  // a sketch that cannot be sent is not the one the fit was made with. The
  // retry of a commit is of the committed fit, whatever is drawn: what its
  // anchors store by now is already part of the drawing
  const sketchChanged =
    survey?.state === 'ready' &&
    survey.fit !== undefined &&
    fitBasis !== undefined &&
    anchorsLeftBehind(survey).length === 0 &&
    (refitTarget === undefined ||
      fitSignature(refitTarget, refitTarget.anchors) !==
        fitSignature(fitBasis, refitTarget.anchors));

  return {
    anchors,
    sketch,
    sketchRestored,
    leftOut,
    groupFixed,
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
      fitStale: sketchChanged,
    }),
    startTarget: surveyTarget(sketch, group),
    refitTarget,
    fitBasis,
    sketchChanged,
    hintKeys: sketchHintKeys(sketch, group),
  };
}
