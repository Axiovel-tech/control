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
import { type RtlsSurveySketch } from './survey-sketch';

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

/** The warnings as one string: an acknowledgement holds for exactly these. */
export const warningsSignature = (survey: RtlsSurvey | undefined): string =>
  JSON.stringify(
    (survey?.gate.warnings ?? []).map(({ code, device, peer, detail }) => [
      code,
      device ?? null,
      peer ?? null,
      detail,
    ])
  );

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

/** The anchors the last commit did not reach. */
export const anchorsLeftBehind = (survey: RtlsSurvey | undefined): string[] =>
  Object.entries(survey?.commit?.results ?? {})
    .filter(([, { written }]) => written === 'failed')
    .map(([id]) => id);

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
 * What the page offers, from the survey as the server last reported it.
 * `refusalKey` is `surveyRefusalKey`; `startProblemKey` and `refitProblemKey`
 * say what the sketch lacks for the anchors a start or a refit would name.
 */
export function surveyControls({
  survey,
  pending,
  available,
  acknowledged,
  refusalKey,
  startProblemKey,
  refitProblemKey,
}: Pick<RtlsSurveySliceState, 'survey' | 'pending' | 'available'> & {
  /** The warnings now shown are acknowledged. */
  acknowledged: boolean;
  refusalKey?: string;
  startProblemKey?: string;
  refitProblemKey?: string;
}): RtlsSurveyControls {
  const phase = survey?.state;
  const idle = pending === undefined;
  const ready = phase === 'ready';
  const running = phase !== undefined && RUNNING_PHASES.includes(phase);

  const startBlockedKey =
    available === false
      ? 'rtlsSurvey.refusal.noServer'
      : (refusalKey ??
        (running ? 'rtlsSurvey.refusal.running' : startProblemKey));

  const commitOffered = survey?.state === 'ready' && survey.fit !== undefined;
  const commitBlockedKey = commitOffered
    ? (refusalKey ?? gateBlockKey(survey.gate, acknowledged))
    : undefined;

  return {
    canStart: idle && startBlockedKey === undefined,
    startBlockedKey,
    canCancel: idle && phase === 'measuring',
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
  /** The warnings (`warningsSignature`) the operator acknowledged. */
  acknowledged?: string;
  /**
   * The frame and placement the server last took with a start or a refit,
   * as the thunk serialized them: the page says when the sketch moved on.
   */
  fittedRequest?: string;
  /** The operator's sketch per cell; the only part kept across reloads. */
  sketches: Record<string, RtlsSurveySketch>;
};

const initialState: RtlsSurveySliceState = { sketches: {} };

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
    },

    /** The answer to this client's request; `request` as sent with it. */
    rtlsSurveyAnswered(
      state,
      {
        payload: { answer, request },
      }: PayloadAction<{ answer: RtlsSurveyAnswer; request?: string }>
    ) {
      const { survey, ...outcome } = answer;
      state.available = true;
      if (survey !== undefined) {
        state.survey = survey;
      }
      if (outcome.action === 'status') {
        return;
      }
      state.pending = undefined;
      state.outcome = outcome;
      if (outcome.result === 'committed') {
        state.acknowledged = undefined;
      }
      if (outcome.result === 'started' || outcome.result === 'fitted') {
        state.fittedRequest = request;
      }
    },

    /** No answer came: a timeout, or a server without the survey. */
    rtlsSurveyRequestFailed(
      state,
      {
        payload: { action, reason },
      }: PayloadAction<{ action: RtlsSurveyAction; reason: string }>
    ) {
      if (action === 'status') {
        state.available = false;
      } else {
        state.pending = undefined;
        state.outcome = { action, result: 'error', reason };
      }
    },

    /** A pushed state object. */
    rtlsSurveyPushed(state, { payload }: PayloadAction<RtlsSurvey>) {
      // an outcome describes the phase it was answered in
      if (state.survey?.state !== payload.state) {
        state.outcome = undefined;
      }
      state.available = true;
      state.survey = payload;
    },

    /** Ticks or clears the acknowledgement of the warnings now shown. */
    acknowledgeRtlsSurveyWarnings(state, { payload }: PayloadAction<boolean>) {
      state.acknowledged = payload
        ? warningsSignature(state.survey)
        : undefined;
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
