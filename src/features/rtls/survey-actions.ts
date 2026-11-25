/**
 * @file Thunks behind the survey page: the X-RTLS-SURVEY requests. Every
 * answer and every failure goes to the slice; the survey itself follows from
 * the state object in the answers and the server's notifications.
 */

import { errorToString } from '~/error-handling';
import { showNotification } from '~/features/snackbar/actions';
import { type Message, type MessageBody } from '~/flockwave/types';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import { type AppThunk } from '~/store/reducers';

import {
  rtlsSurveyAnswered,
  rtlsSurveyRequested,
  rtlsSurveyRequestFailed,
  setRtlsSurveySketch,
} from './survey';
import {
  frameTransform,
  PLAN_AS_FRAME,
  type RtlsSurveyRememberedFit,
} from './survey-frame';
import {
  mapRtlsSurveyAnswer,
  type RtlsSurveyAction,
  type RtlsSurveyAnswer,
} from './survey-messages';
import { getRtlsSurveyPage } from './survey-selectors';
import { type AnyRecord, toText } from './wire-values';

/**
 * How long each answer may take, seconds. A start is answered once the
 * server checked the anchors, a commit once every anchor reports the new
 * survey ID: a write (5 s and a 1 s late-ack grace), then its 1 Hz stat.
 */
const TIMEOUT_S: Record<RtlsSurveyAction, number> = {
  status: 5,
  start: 15,
  cancel: 15,
  fit: 15,
  commit: 30,
};

/** The server answered, but not with the survey: it has none. */
class NoSurveyAnswer extends Error {}

/**
 * Sends one X-RTLS-SURVEY request. Every answer is a normal response with a
 * `result`. An answer of another type (a NAK from a server without the
 * survey) rejects with `NoSurveyAnswer`; a timeout or a dropped connection
 * rejects with the hub's own error.
 */
async function sendRtlsSurvey(
  action: RtlsSurveyAction,
  members: AnyRecord
): Promise<RtlsSurveyAnswer> {
  const response: Message<MessageBody & AnyRecord> =
    await messageHub.sendMessage(
      { type: 'X-RTLS-SURVEY', action, ...members },
      { timeout: TIMEOUT_S[action] }
    );
  const body = response.body;
  if (body?.type !== 'X-RTLS-SURVEY') {
    throw new NoSurveyAnswer(
      toText(body?.reason) ??
        `Unexpected response to X-RTLS-SURVEY (${String(body?.type)})`
    );
  }
  return mapRtlsSurveyAnswer(action, body);
}

/** Sends a request and hands its answer, or its failure, to the slice. */
const request =
  (
    action: RtlsSurveyAction,
    members: AnyRecord = {},
    remembered?: RtlsSurveyRememberedFit
  ): AppThunk<Promise<RtlsSurveyAnswer | undefined>> =>
  async (dispatch) => {
    if (action !== 'status') {
      dispatch(rtlsSurveyRequested(action));
    }
    try {
      const answer = await sendRtlsSurvey(action, members);
      dispatch(rtlsSurveyAnswered({ answer, request: remembered }));
      return answer;
    } catch (error) {
      dispatch(
        rtlsSurveyRequestFailed({
          action,
          reason: errorToString(error),
          answered: error instanceof NoSurveyAnswer,
        })
      );
      return undefined;
    }
  };

/**
 * Reads the survey the server holds: the page asks as it opens, and again
 * after a request that got no answer.
 */
export const queryRtlsSurvey =
  (): AppThunk<Promise<void>> => async (dispatch) => {
    await dispatch(request('status'));
  };

/**
 * Starts a survey of the cell's anchors the sketch does not leave out, with
 * the frame and placement of the sketch. Sends nothing unless the page offers
 * it at this moment: the guard, the sketch and a request still in flight are
 * checked here again, since the click may be older than the store.
 */
export const startRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const { anchors, controls, sketch, sketchRestored, startTarget } =
      getRtlsSurveyPage(getState(), cell);
    if (!controls.canStart || startTarget === undefined) {
      return;
    }
    if (sketchRestored) {
      // the run this frame was taken from ends with the new one: from here
      // on it is this client's own sketch
      dispatch(setRtlsSurveySketch({ cell, sketch }));
    }
    await dispatch(
      request('start', startTarget, {
        frame: startTarget.frame,
        placement: startTarget.placement,
        transform: frameTransform(sketch, anchors) ?? PLAN_AS_FRAME,
      })
    );
  };

/** Stops the cell's running survey; the anchors return to their own session. */
export const cancelRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    if (getRtlsSurveyPage(getState(), cell).controls.canCancel) {
      await dispatch(request('cancel'));
    }
  };

/**
 * Fits the cell's held measurement again with the sketch as it is now, for
 * the anchors that were measured.
 */
export const refitRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const { controls, measured, refitTarget, sketch } = getRtlsSurveyPage(
      getState(),
      cell
    );
    if (!controls.canRefit || refitTarget === undefined) {
      return;
    }
    const { frame, placement } = refitTarget;
    await dispatch(
      request(
        'fit',
        { frame, ...(placement === undefined ? {} : { placement }) },
        {
          frame,
          placement,
          transform: frameTransform(sketch, measured) ?? PLAN_AS_FRAME,
        }
      )
    );
  };

/**
 * Commits the cell's held fit, with the acknowledgement of the warnings now
 * shown. The page then shows what each anchor answered and offers the lock;
 * no dialog opens over the results. Sends nothing unless the page offers the
 * commit at this moment: a block, a warning not acknowledged, another cell's
 * survey or a request still in flight may have reached the store after the
 * click.
 */
export const commitRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const { acknowledged, controls } = getRtlsSurveyPage(getState(), cell);
    if (!controls.canCommit) {
      return;
    }
    const answer = await dispatch(
      request('commit', acknowledged ? { acknowledgeWarnings: true } : {})
    );
    if (answer?.result === 'committed') {
      showNotification(i18n.t('rtlsSurvey.notification.committed'));
    }
  };
