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

import { openRtlsLockDialog } from './slice';
import {
  rtlsSurveyAnswered,
  rtlsSurveyRequested,
  rtlsSurveyRequestFailed,
} from './survey';
import {
  mapRtlsSurveyAnswer,
  type RtlsSurveyAction,
  type RtlsSurveyAnswer,
} from './survey-messages';
import {
  areRtlsSurveyWarningsAcknowledged,
  getRtlsSurveyCells,
  getRtlsSurveyRefitGroup,
  getRtlsSurveyRefusalKey,
  getRtlsSurveySketch,
} from './survey-selectors';
import {
  type RtlsSurveyTarget,
  surveyGroup,
  surveyTarget,
} from './survey-sketch';
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

/** The frame and placement of a target, as the slice remembers them. */
export const targetSignature = ({
  frame,
  placement,
}: RtlsSurveyTarget): string => JSON.stringify({ frame, placement });

/**
 * Sends one X-RTLS-SURVEY request. Every answer is a normal response with a
 * `result`; only a NAK (a server without the survey) or a timeout rejects.
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
    throw new Error(
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
    target?: RtlsSurveyTarget
  ): AppThunk<Promise<RtlsSurveyAnswer | undefined>> =>
  async (dispatch) => {
    if (action !== 'status') {
      dispatch(rtlsSurveyRequested(action));
    }
    try {
      const answer = await sendRtlsSurvey(action, members);
      dispatch(
        rtlsSurveyAnswered({
          answer,
          request: target === undefined ? undefined : targetSignature(target),
        })
      );
      return answer;
    } catch (error) {
      dispatch(
        rtlsSurveyRequestFailed({ action, reason: errorToString(error) })
      );
      return undefined;
    }
  };

/** Reads the survey the server holds (the page asks as it opens). */
export const queryRtlsSurvey =
  (): AppThunk<Promise<void>> => async (dispatch) => {
    await dispatch(request('status'));
  };

/**
 * Starts a survey of the cell's anchors the sketch does not leave out, with
 * the frame and placement of the sketch. Sends nothing while the guard
 * refuses or the sketch lacks something: the page says which.
 */
export const startRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const state = getState();
    const sketch = getRtlsSurveySketch(state, cell);
    const target = surveyTarget(
      sketch,
      surveyGroup(sketch, getRtlsSurveyCells(state)[cell] ?? [])
    );
    if (getRtlsSurveyRefusalKey(state) !== undefined || target === undefined) {
      return;
    }
    await dispatch(request('start', target, target));
  };

/** Stops the running survey; the anchors return to their own session. */
export const cancelRtlsSurvey =
  (): AppThunk<Promise<void>> => async (dispatch) => {
    await dispatch(request('cancel'));
  };

/** Fits the held measurement again with the sketch as it is now. */
export const refitRtlsSurvey =
  (cell: string): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const state = getState();
    const target = surveyTarget(
      getRtlsSurveySketch(state, cell),
      getRtlsSurveyRefitGroup(state)
    );
    if (target === undefined) {
      return;
    }
    const { frame, placement } = target;
    await dispatch(
      request(
        'fit',
        { frame, ...(placement === undefined ? {} : { placement }) },
        target
      )
    );
  };

/**
 * Commits the held fit, with the acknowledgement when the operator gave it
 * for the warnings now shown, and opens the lock dialog once every anchor
 * took it. Sends nothing while the guard refuses.
 */
export const commitRtlsSurvey =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState();
    if (getRtlsSurveyRefusalKey(state) !== undefined) {
      return;
    }
    const answer = await dispatch(
      request(
        'commit',
        areRtlsSurveyWarningsAcknowledged(state)
          ? { acknowledgeWarnings: true }
          : {}
      )
    );
    if (answer?.result === 'committed') {
      showNotification(i18n.t('rtlsSurvey.notification.committed'));
      dispatch(openRtlsLockDialog());
    }
  };
