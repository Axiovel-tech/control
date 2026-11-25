/**
 * @file The anchor survey as Control holds it: the server's survey state
 * object (every X-RTLS-SURVEY answer and notification replaces it), what the
 * last request of this client came to, and the operator's sketch per cell.
 * The run, the fit and the commit gate are the server's.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { type AppDispatch } from '~/store/reducers';

import { cellApplyRefusalKey } from './cell-settings';
import { clearRtlsDevices } from './slice';
import {
  type RtlsSurvey,
  type RtlsSurveyAction,
  type RtlsSurveyAnswer,
  type RtlsSurveyGate,
  type RtlsSurveyOutcome,
  type RtlsSurveyPhase,
  surveyOfBody,
} from './survey-messages';
import { type RtlsSurveyRememberedFit } from './survey-frame';
import { type RtlsSurveySketch, withPositionsCommitted } from './survey-sketch';

/** How a residual reads against the server's commit warnings. */
export type RtlsSurveyResidualLevel = 'ok' | 'warning' | 'error';

/** The server's bound for its warning about the fit's rms, metres. */
const RESIDUAL_NOTICE_M = 0.05;

/** The server's bound for its warning about one pair, metres. */
const RESIDUAL_WARNING_M = 0.1;

/** The colour class of a pair's residual in the pair table. */
export const residualLevel = (
  residualM: number | undefined
): RtlsSurveyResidualLevel => {
  const size = Math.abs(residualM ?? 0);
  return size > RESIDUAL_WARNING_M
    ? 'error'
    : size > RESIDUAL_NOTICE_M
      ? 'warning'
      : 'ok';
};

/** What the commit gate says of a fit. */
export type RtlsSurveyGateVerdict = 'blocked' | 'warnings' | 'clear';

/**
 * The gate in one word, shown with the fit whatever it is: a gate that
 * passes says so ("no blocks, no warnings") instead of showing nothing.
 */
export const gateVerdict = ({
  blocked,
  warnings,
}: RtlsSurveyGate): RtlsSurveyGateVerdict =>
  blocked.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'clear';

/**
 * Whether the pair table opens by itself: only while a pair is past a
 * warning bound. Otherwise it stays folded under the fit, the gate and the
 * commit, which must not be pushed out of sight by one row per pair.
 */
export const pairsNeedALook = (survey: RtlsSurvey): boolean =>
  survey.pairs.some(({ residualM }) => residualLevel(residualM) !== 'ok');

/**
 * A fit and its warnings as one string: an acknowledgement holds for exactly
 * these warnings of exactly this fit.
 */
export const warningsSignature = (survey: RtlsSurvey | undefined): string =>
  JSON.stringify([
    survey?.fit ?? null,
    (survey?.gate.warnings ?? []).map(({ code, device, peer, detail }) => [
      code,
      device ?? null,
      peer ?? null,
      detail,
    ]),
  ]);

/**
 * The i18n key of why neither Survey nor Commit may be sent now; `undefined`
 * when they may. Locked anchors and a drone that may be armed are the cell
 * Apply's guard; an authorized show comes between them. The server refuses
 * the same, and more, with its own reason.
 */
export const surveyRefusalKey = ({
  showAuthorized,
  ...cell
}: {
  lockedCount: number;
  showAuthorized: boolean;
  armedCount: number;
  anyOnline: boolean;
}): string | undefined =>
  cell.lockedCount === 0 && showAuthorized
    ? 'rtlsSurvey.refusal.showAuthorized'
    : cellApplyRefusalKey(cell);

/** What the page offers now, and the i18n key of why it does not. */
export type RtlsSurveyControls = {
  canStart: boolean;
  startBlockedKey?: string;
  canCancel: boolean;
  canRefit: boolean;
  /** A fit is held: the commit is on offer. */
  commitOffered: boolean;
  canCommit: boolean;
  commitBlockedKey?: string;
  /** The last commit left anchors behind: this one resends it. */
  retry: boolean;
};

const RUNNING_PHASES: readonly RtlsSurveyPhase[] = [
  'measuring',
  'returning',
  'committing',
];

/**
 * The anchors a commit that ended left behind: those whose write failed and
 * those that took it but do not report the new survey ID. None while no
 * commit was tried, and none while one still runs.
 */
export function anchorsLeftBehind(survey: RtlsSurvey | undefined): string[] {
  const commit = survey?.commit;
  if (survey?.state !== 'ready' || commit === undefined) {
    return [];
  }
  return survey.anchors.filter(
    (id) =>
      commit.results[id]?.written === 'failed' || !commit.running.includes(id)
  );
}

/** The i18n key of why the gate keeps a fit from being committed. */
const gateBlockKey = (
  { blocked, warnings }: RtlsSurveyGate,
  acknowledged: boolean
): string | undefined =>
  blocked.length > 0
    ? 'rtlsSurvey.commit.blocked'
    : warnings.length > 0 && !acknowledged
      ? 'rtlsSurvey.commit.acknowledgeFirst'
      : undefined;

/**
 * The i18n key of why a held fit is not committed as it is: an anchor of it
 * went offline, the sketch moved on since it was made (its gate is then of
 * another sketch), or its gate.
 */
const fitBlockKey = (
  gate: RtlsSurveyGate,
  {
    acknowledged,
    groupOffline,
    fitStale,
  }: { acknowledged: boolean; groupOffline: boolean; fitStale: boolean }
): string | undefined =>
  groupOffline
    ? 'rtlsSurvey.commit.surveyAgain'
    : fitStale
      ? 'rtlsSurvey.commit.refitFirst'
      : gateBlockKey(gate, acknowledged);

/**
 * What the page offers for one cell, from the survey as the server last
 * reported it. `refusalKey` is `surveyRefusalKey`; `startProblemKey` and
 * `refitProblemKey` say what the sketch lacks for the anchors a start or a
 * refit would name. A survey held for another cell (`elsewhere`) can be
 * replaced from here, never cancelled, refitted or committed. With an anchor
 * of the measured group offline the server commits nothing. A fit made with
 * another sketch than the one on screen (`fitStale`) is not committed: the
 * operator refits first.
 */
export function surveyControls({
  survey,
  pending,
  available,
  acknowledged,
  refusalKey,
  startProblemKey,
  refitProblemKey,
  elsewhere = false,
  groupOffline = false,
  fitStale = false,
}: Pick<RtlsSurveySliceState, 'survey' | 'pending' | 'available'> & {
  /** The warnings now shown are acknowledged. */
  acknowledged: boolean;
  refusalKey?: string;
  startProblemKey?: string;
  refitProblemKey?: string;
  elsewhere?: boolean;
  groupOffline?: boolean;
  fitStale?: boolean;
}): RtlsSurveyControls {
  const phase = survey?.state;
  const idle = pending === undefined;
  const ready = phase === 'ready' && !elsewhere;
  const running = phase !== undefined && RUNNING_PHASES.includes(phase);

  const startBlockedKey =
    available === false
      ? 'rtlsSurvey.refusal.noServer'
      : (refusalKey ??
        (running ? 'rtlsSurvey.refusal.running' : startProblemKey));

  const commitOffered =
    !elsewhere && survey?.state === 'ready' && survey.fit !== undefined;
  const commitBlockedKey = commitOffered
    ? (refusalKey ??
      fitBlockKey(survey.gate, { acknowledged, groupOffline, fitStale }))
    : undefined;

  return {
    canStart: idle && startBlockedKey === undefined,
    startBlockedKey,
    canCancel: idle && phase === 'measuring' && !elsewhere,
    canRefit: idle && ready && refitProblemKey === undefined,
    commitOffered,
    canCommit: idle && commitOffered && commitBlockedKey === undefined,
    commitBlockedKey,
    retry: anchorsLeftBehind(survey).length > 0,
  };
}

export type RtlsSurveySliceState = {
  /** The server's state object; `undefined` until it reported one. */
  survey?: RtlsSurvey;
  /** The request of this client that waits for its answer. */
  pending?: RtlsSurveyAction;
  /** What the last request came to, until the survey moves on. */
  outcome?: RtlsSurveyOutcome;
  /** `false` once the server answered that it has no survey. */
  available?: boolean;
  /** Status requests that got no answer at all: each asks for another try. */
  statusFailures?: number;
  /**
   * How many state objects were held so far: a status request remembers it
   * as it leaves, and its reply is too old when another state came since.
   */
  held?: number;
  /** The warnings (`warningsSignature`) the operator acknowledged. */
  acknowledged?: string;
  /**
   * The frame and placement the server last took from this client with a
   * start or a refit, and how the plan drew that frame then. The server's
   * echo of them, when it sends one, says whether the held fit is that one.
   */
  fittedRequest?: RtlsSurveyRememberedFit;
  /** The operator's sketch per cell, kept across reloads. */
  sketches: Record<string, RtlsSurveySketch>;
  /**
   * The survey ID of the last commit whose anchors left the sketches: what
   * was drawn of them gave way to the positions they store. Kept across
   * reloads, so that the same commit, reported again, takes nothing drawn
   * since.
   */
  committedSurveyId?: number;
};

const initialState: RtlsSurveySliceState = { sketches: {} };

/** How long the page waits before it asks again after an unanswered status. */
const STATUS_RETRY_MS = 5000;

/** When the page asks for the survey: at once, or after a failed try. */
export const statusQueryDelayMs = (failures: number | undefined): number =>
  failures === undefined ? 0 : STATUS_RETRY_MS;

const sameFit = (a: RtlsSurvey | undefined, b: RtlsSurvey): boolean =>
  JSON.stringify(a?.fit) === JSON.stringify(b.fit);

/**
 * A committed survey is what its anchors store from now on: the sketches
 * give up what was drawn of them, once per commit.
 */
const applyCommit = (state: RtlsSurveySliceState, survey: RtlsSurvey): void => {
  const surveyId = survey.commit?.surveyId;
  const seen =
    surveyId === undefined
      ? state.survey?.state === 'committed'
      : state.committedSurveyId === surveyId;
  if (survey.state !== 'committed' || seen) {
    return;
  }
  state.committedSurveyId = surveyId;
  for (const [cell, sketch] of Object.entries(state.sketches)) {
    state.sketches[cell] = withPositionsCommitted(sketch, survey.anchors);
  }
};

/**
 * Whether a state object is older than the held one: its `revision` is
 * lower. The server counts every change of its survey, so a reply that was
 * overtaken by a notification is told apart by it. A server that does not
 * count yet leaves only this: the reply to a status request (`heldAtRequest`
 * is `held` as the request left) is older than any state held since.
 */
const isOutdated = (
  state: RtlsSurveySliceState,
  survey: RtlsSurvey,
  heldAtRequest?: number
): boolean => {
  const current = state.survey?.revision;
  return current !== undefined && survey.revision !== undefined
    ? survey.revision < current
    : heldAtRequest !== undefined && heldAtRequest !== (state.held ?? 0);
};

/**
 * Takes the server's state object. An acknowledgement is for one fit: any
 * other fit, and none at all while a new measurement runs, voids it.
 */
const holdSurvey = (state: RtlsSurveySliceState, survey: RtlsSurvey): void => {
  if (!sameFit(state.survey, survey)) {
    state.acknowledged = undefined;
  }
  applyCommit(state, survey);
  state.survey = survey;
  state.held = (state.held ?? 0) + 1;
};

const { actions, reducer } = createSlice({
  name: 'rtlsSurvey',
  initialState,
  reducers: {
    /** A request other than a status query left this client. */
    rtlsSurveyRequested(
      state,
      { payload }: PayloadAction<Exclude<RtlsSurveyAction, 'status'>>
    ) {
      state.pending = payload;
      state.outcome = undefined;
      // what comes back is another measurement or another fit
      if (payload === 'start' || payload === 'fit') {
        state.acknowledged = undefined;
      }
    },

    /**
     * The answer to this client's request; `request` as sent with it, and
     * for a status request `heldAtRequest`, the slice's `held` as it left.
     */
    rtlsSurveyAnswered(
      state,
      {
        payload: { answer, request, heldAtRequest },
      }: PayloadAction<{
        answer: RtlsSurveyAnswer;
        request?: RtlsSurveyRememberedFit;
        heldAtRequest?: number;
      }>
    ) {
      const { survey: answered, ...outcome } = answer;
      state.available = true;
      // an answer overtaken by a newer state says what it came to, but its
      // state object is not the survey any more
      const survey =
        answered !== undefined && !isOutdated(state, answered, heldAtRequest)
          ? answered
          : undefined;
      // a refit that changes nothing must still say that it ran
      const unchanged =
        outcome.result === 'fitted' &&
        survey !== undefined &&
        sameFit(state.survey, survey);
      if (survey !== undefined) {
        holdSurvey(state, survey);
      }
      if (outcome.action === 'status') {
        return;
      }
      state.pending = undefined;
      state.outcome =
        outcome.result === 'fitted' ? { ...outcome, unchanged } : outcome;
      if (outcome.result === 'committed') {
        state.acknowledged = undefined;
      }
      if (outcome.result === 'started' || outcome.result === 'fitted') {
        state.fittedRequest = request;
      }
    },

    /**
     * The request did not go through. `answered`: the server answered, but
     * not with the survey (it has none); otherwise nothing came back at all
     * (a timeout, a connection that dropped), which says nothing about the
     * server and leaves a status request to be tried again.
     */
    rtlsSurveyRequestFailed(
      state,
      {
        payload: { action, reason, answered },
      }: PayloadAction<{
        action: RtlsSurveyAction;
        reason: string;
        answered: boolean;
      }>
    ) {
      if (action !== 'status') {
        state.pending = undefined;
        state.outcome = { action, result: 'error', reason };
      } else if (answered) {
        state.available = false;
      } else {
        state.statusFailures = (state.statusFailures ?? 0) + 1;
      }
    },

    /** A pushed state object. */
    rtlsSurveyPushed(state, { payload }: PayloadAction<RtlsSurvey>) {
      if (isOutdated(state, payload)) {
        return;
      }
      // an outcome describes the phase it was answered in
      if (state.survey?.state !== payload.state) {
        state.outcome = undefined;
      }
      state.available = true;
      holdSurvey(state, payload);
    },

    /**
     * Ticks the acknowledgement of the warnings on screen, given as their
     * `warningsSignature`, or clears it. What is acknowledged is what the
     * operator saw: a fit that arrived as the box was ticked is not.
     */
    acknowledgeRtlsSurveyWarnings(
      state,
      { payload }: PayloadAction<string | undefined>
    ) {
      state.acknowledged = payload;
    },

    setRtlsSurveySketch(
      state,
      {
        payload: { cell, sketch },
      }: PayloadAction<{ cell: string; sketch: RtlsSurveySketch }>
    ) {
      state.sketches[cell] = sketch;
    },
  },
  extraReducers(builder) {
    // the next server reports its own survey; the sketches are the venue's
    builder.addCase(clearRtlsDevices, (state) => ({
      sketches: state.sketches,
      committedSurveyId: state.committedSurveyId,
    }));
  },
});

export const {
  acknowledgeRtlsSurveyWarnings,
  rtlsSurveyAnswered,
  rtlsSurveyPushed,
  rtlsSurveyRequested,
  rtlsSurveyRequestFailed,
  setRtlsSurveySketch,
} = actions;

export default reducer;

/** Handles a pushed X-RTLS-SURVEY: the state object replaces the held one. */
export function handleRtlsSurveyMessage(
  body: unknown,
  dispatch: AppDispatch
): void {
  const survey = surveyOfBody(body);
  if (survey !== undefined) {
    dispatch(rtlsSurveyPushed(survey));
  }
}
