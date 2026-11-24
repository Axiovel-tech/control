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
  sketchHintKeys,
  sketchProblemKey,
  surveyTarget,
} from './survey-frame';
import { type RtlsSurvey } from './survey-messages';
import {
  EMPTY_SKETCH,
  resolveSketch,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  surveyGroup,
} from './survey-sketch';

export type RtlsSurveyPage = {
  /** The online anchors of the cell, in slot order. */
  anchors: RtlsSurveyAnchor[];
  /** The sketch as shown and sent (`resolveSketch`). */
  sketch: RtlsSurveySketch;
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

  const sketch = resolveSketch(slice.sketches[cell] ?? EMPTY_SKETCH, [
    ...anchors,
    ...measured.filter(({ id }) => !online.has(id)),
  ]);
  const group = surveyGroup(sketch, anchors);
  const refitTarget =
    survey?.fit === undefined ? undefined : surveyTarget(sketch, measured);
  const fitBasis = survey?.basis ?? slice.fittedRequest;
  const acknowledged =
    slice.acknowledged !== undefined &&
    slice.acknowledged === warningsSignature(survey);

  return {
    anchors,
    sketch,
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
      startProblemKey: sketchProblemKey(sketch, group),
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
