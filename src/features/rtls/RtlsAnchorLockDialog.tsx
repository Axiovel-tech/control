/**
 * @file The anchor lock dialog. Unlocked: locks the anchors, listing the
 * cell's warnings for acknowledgement when the server raises any. Broken:
 * lists what broke the lock and re-seals it (a fresh snapshot that clears
 * the breaks) once the operator has reviewed them. Locked: shows since when
 * and the warnings acknowledged then.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { errorToString } from '~/error-handling';
import { type AppDispatch } from '~/store/reducers';

import { lockRtlsAnchors, unlockRtlsAnchors } from './lock-actions';
import { describeLockBreak, describeLockIssue } from './lock-text';
import {
  getRtlsAnchorLock,
  getRtlsAnchorLockState,
  isRtlsLockDialogOpen,
} from './selectors';
import { closeRtlsLockDialog } from './slice';
import { type RtlsLockIssue } from './types';

const IssueList = ({ lines }: { lines: string[] }) => (
  <ul style={{ marginTop: 4, marginBottom: 8, paddingLeft: 20 }}>
    {lines.map((line, index) => (
      <li key={index}>
        <Typography variant='body2'>{line}</Typography>
      </li>
    ))}
  </ul>
);

const RtlsAnchorLockDialog = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsLockDialogOpen);
  const lock = useSelector(getRtlsAnchorLock);
  const state = useSelector(getRtlsAnchorLockState);

  // the warnings the server answered the last lock attempt with
  const [pending, setPending] = useState<RtlsLockIssue[]>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setPending(undefined);
      setAcknowledged(false);
      setError(undefined);
    }
  }, [open]);

  const close = useCallback(() => dispatch(closeRtlsLockDialog()), [dispatch]);

  const reseal = state === 'broken';
  // re-sealing always confirms a review; a first lock only when the server
  // raised warnings
  const needsAcknowledgement = reseal || (pending?.length ?? 0) > 0;

  const handleLock = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await dispatch(
        lockRtlsAnchors(needsAcknowledgement && acknowledged)
      );
      if (result.locked) {
        // stay open to show the warnings acknowledged with the lock
        if (result.warnings.length === 0) {
          close();
        }
      } else if (result.warnings.length > 0) {
        setPending(result.warnings);
        setAcknowledged(false);
      } else {
        setError(t('rtlsAnchorLock.dialog.notLocked'));
      }
    } catch (lockError) {
      setError(errorToString(lockError));
    } finally {
      setBusy(false);
    }
  }, [acknowledged, close, dispatch, needsAcknowledgement, t]);

  const locked = state === 'locked';

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={t(
        reseal
          ? 'rtlsAnchorLock.dialog.resealTitle'
          : locked
            ? 'rtlsAnchorLock.dialog.lockedTitle'
            : 'rtlsAnchorLock.dialog.lockTitle'
      )}
      onClose={close}
    >
      <DialogContent data-testid='rtls-lock-dialog'>
        {reseal && (
          <>
            <Typography variant='body2'>
              {t('rtlsAnchorLock.dialog.breaks')}
            </Typography>
            <IssueList
              lines={lock!.breaks.map((entry) => describeLockBreak(t, entry))} // non-null: broken
            />
          </>
        )}
        {locked && (
          <>
            <Typography variant='body2'>
              {t('rtlsAnchorLock.dialog.lockedSince', {
                time:
                  lock?.lockedAt === undefined
                    ? '—'
                    : new Date(lock.lockedAt).toLocaleString(),
              })}
            </Typography>
            {(lock?.warnings.length ?? 0) > 0 && (
              <>
                <Typography variant='body2' sx={{ mt: 1 }}>
                  {t('rtlsAnchorLock.dialog.acknowledgedWarnings')}
                </Typography>
                <IssueList
                  lines={lock!.warnings.map((issue) =>
                    describeLockIssue(t, issue)
                  )} // non-null: checked just above
                />
              </>
            )}
          </>
        )}
        {state === 'unlocked' && (
          <Typography variant='body2'>
            {t('rtlsAnchorLock.dialog.explanation')}
          </Typography>
        )}
        {pending !== undefined && pending.length > 0 && (
          <>
            <Typography variant='body2' sx={{ mt: 1 }}>
              {t('rtlsAnchorLock.dialog.warnings')}
            </Typography>
            <IssueList
              lines={pending.map((issue) => describeLockIssue(t, issue))}
            />
          </>
        )}
        {!locked && needsAcknowledgement && (
          <FormControlLabel
            control={
              <Checkbox
                data-testid='rtls-lock-acknowledge'
                checked={acknowledged}
                disabled={busy}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
            }
            label={t(
              reseal
                ? 'rtlsAnchorLock.dialog.acknowledgeBreaks'
                : 'rtlsAnchorLock.dialog.acknowledgeWarnings'
            )}
          />
        )}
        {error !== undefined && (
          <Alert severity='error' sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('general.action.close')}</Button>
        {locked ? (
          <Button
            color='warning'
            onClick={() => {
              close();
              void dispatch(unlockRtlsAnchors());
            }}
          >
            {t('rtlsAnchorLock.dialog.unlock')}
          </Button>
        ) : (
          <Button
            data-testid='rtls-lock-confirm'
            color='primary'
            variant='contained'
            disabled={busy || (needsAcknowledgement && !acknowledged)}
            onClick={() => void handleLock()}
          >
            {t(
              reseal
                ? 'rtlsAnchorLock.dialog.reseal'
                : 'rtlsAnchorLock.dialog.lock'
            )}
          </Button>
        )}
      </DialogActions>
    </DraggableDialog>
  );
};

export default RtlsAnchorLockDialog;
