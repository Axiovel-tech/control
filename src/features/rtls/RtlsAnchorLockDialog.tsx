/**
 * @file The lock dialog: one line and the opt-in resurvey check, then the
 * server's warnings with an acknowledgement when it raises any, or its
 * reason when it refuses (an anchor that is not operating). The check runs
 * with the first Lock only: Lock anyway does not measure again.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { errorToString } from '~/error-handling';
import { type AppDispatch } from '~/store/reducers';

import { type RtlsLockOutcome, sendRtlsLockCommand } from './anchor-lock';
import { isRtlsLockDialogOpen } from './selectors';
import { closeRtlsLockDialog } from './slice';

const RtlsAnchorLockDialog = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsLockDialogOpen);

  // the warnings the server answered the last lock attempt with
  const [warnings, setWarnings] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [resurvey, setResurvey] = useState(false);
  // the resurvey check of the lock under way is measuring
  const [measuring, setMeasuring] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  // moves on every open and close: a reply to an earlier attempt is dropped
  const attempt = useRef(0);

  useEffect(() => {
    attempt.current += 1;
    if (open) {
      setBusy(false);
      setMeasuring(false);
      setWarnings([]);
      setAcknowledged(false);
      setResurvey(false);
      setError(undefined);
    }
  }, [open]);

  const close = useCallback(() => dispatch(closeRtlsLockDialog()), [dispatch]);

  const handleLock = useCallback(async () => {
    const sent = attempt.current;
    const check = resurvey && warnings.length === 0;
    setBusy(true);
    setMeasuring(check);
    setError(undefined);
    let result: RtlsLockOutcome | undefined;
    let failure: string | undefined;
    try {
      result = await dispatch(
        sendRtlsLockCommand(
          'lock',
          warnings.length > 0 && acknowledged,
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
    setBusy(false);
    setMeasuring(false);
    if (result?.result === 'locked') {
      close();
    } else if (result?.result === 'warnings') {
      setWarnings(result.warnings);
      setAcknowledged(false);
    } else {
      setError(result?.error ?? failure);
    }
  }, [acknowledged, close, dispatch, resurvey, warnings.length]);

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={t('rtlsAnchorLock.title')}
      onClose={close}
    >
      <DialogContent data-testid='rtls-lock-dialog'>
        <Typography variant='body2'>
          {t('rtlsAnchorLock.dialog.text')}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              data-testid='rtls-lock-resurvey'
              checked={resurvey}
              disabled={busy || warnings.length > 0}
              onChange={(event) => setResurvey(event.target.checked)}
            />
          }
          label={t('rtlsAnchorLock.dialog.resurvey')}
        />
        {measuring && (
          <>
            <LinearProgress data-testid='rtls-lock-measuring' />
            <Typography variant='caption' color='text.secondary'>
              {t('rtlsAnchorLock.dialog.measuring')}
            </Typography>
          </>
        )}
        {warnings.length > 0 && (
          <>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
              {warnings.map((text, index) => (
                <li key={index}>
                  <Typography variant='body2'>{text}</Typography>
                </li>
              ))}
            </ul>
            <FormControlLabel
              control={
                <Checkbox
                  data-testid='rtls-lock-acknowledge'
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
              }
              label={t('rtlsAnchorLock.dialog.acknowledge')}
            />
          </>
        )}
        {error !== undefined && (
          <Alert severity='error' sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('general.action.cancel')}</Button>
        <Button
          data-testid='rtls-lock-confirm'
          color='primary'
          variant='contained'
          disabled={busy || (warnings.length > 0 && !acknowledged)}
          onClick={() => void handleLock()}
        >
          {t('rtlsAnchorLock.lock')}
        </Button>
      </DialogActions>
    </DraggableDialog>
  );
};

export default RtlsAnchorLockDialog;
