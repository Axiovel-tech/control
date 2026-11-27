/**
 * @file The lock dialog: one line and the opt-in resurvey check, then the
 * server's warnings with an acknowledgement when it raises any, or its
 * reason when it refuses (an anchor that is not operating). The check runs
 * with the first Lock only: Lock anyway does not measure again.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { errorToString } from '~/error-handling';
import { type AppDispatch } from '~/store/reducers';

import { type RtlsLockOutcome, sendRtlsLockCommand } from './anchor-lock';
import {
  LOCK_DIALOG_OPENED,
  lockDialogReducer,
  runsResurveyCheck,
} from './anchor-lock-dialog';
import RtlsAnchorLockDialogView from './RtlsAnchorLockDialogView';
import { isRtlsLockDialogOpen } from './selectors';
import { closeRtlsLockDialog } from './slice';

const RtlsAnchorLockDialog = () => {
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsLockDialogOpen);
  const [state, update] = useReducer(lockDialogReducer, LOCK_DIALOG_OPENED);
  // moves on every open and close: a reply to an earlier attempt is dropped
  const attempt = useRef(0);

  useEffect(() => {
    attempt.current += 1;
    if (open) {
      update({ type: 'opened' });
    }
  }, [open]);

  const close = useCallback(() => dispatch(closeRtlsLockDialog()), [dispatch]);

  const handleLock = useCallback(async () => {
    const sent = attempt.current;
    const acknowledge = state.warnings.length > 0 && state.acknowledged;
    const check = runsResurveyCheck(state);
    update({ type: 'sent' });
    let outcome: RtlsLockOutcome | undefined;
    let failure: string | undefined;
    try {
      outcome = await dispatch(
        sendRtlsLockCommand(
          'lock',
          acknowledge,
          () => sent === attempt.current,
          check
        )
      );
    } catch (lockError) {
      failure = errorToString(lockError);
    }
    if (sent !== attempt.current) {
      return;
    }
    update({ type: 'answered', outcome, failure });
    if (outcome?.result === 'locked') {
      close();
    }
  }, [close, dispatch, state]);

  return (
    <RtlsAnchorLockDialogView
      open={open}
      state={state}
      onClose={close}
      onLock={() => void handleLock()}
      onResurvey={(checked) => update({ type: 'resurvey', checked })}
      onAcknowledge={(checked) => update({ type: 'acknowledged', checked })}
    />
  );
};

export default RtlsAnchorLockDialog;
