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

import {
  fetchRtlsLockStatus,
  lockRtlsAnchors,
  unlockRtlsAnchors,
} from './lock-actions';
import { describeLockBreak, newestBreaksFirst } from './lock-text';
import {
  getRtlsAnchorLock,
  getRtlsAnchorLockState,
  isRtlsLockDialogOpen,
} from './selectors';
import { closeRtlsLockDialog } from './slice';
import {
  type AnchorLockState,
  type RtlsAnchorLock,
  type RtlsLockIssue,
} from './anchor-lock';

const IssueList = ({ lines }: { lines: string[] }) => (
  <ul style={{ marginTop: 4, marginBottom: 8, paddingLeft: 20 }}>
    {lines.map((line, index) => (
      <li key={index}>
        <Typography variant='body2'>{line}</Typography>
      </li>
    ))}
  </ul>
);

/**
 * The dialog's lock flow: the warnings the server answered with (or, for a
 * re-seal, the current ones read with `status` before the operator can
 * confirm), the acknowledgement, and the lock request.
 */
const useLockFlow = (open: boolean, reseal: boolean, onLocked: () => void) => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const [pending, setPending] = useState<RtlsLockIssue[]>();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [reviewed, setReviewed] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    setPending(undefined);
    setAcknowledged(false);
    setError(undefined);
    setReviewed(false);
    if (!reseal) {
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await dispatch(fetchRtlsLockStatus());
        if (!cancelled) {
          setPending(result.warnings);
          setReviewed(true);
        }
      } catch (statusError) {
        if (!cancelled) {
          setError(errorToString(statusError));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch, open, reseal]);

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
      if (result.result === 'locked') {
        // the locked view lists the acknowledged warnings; the pending list
        // goes, and without warnings there is nothing left to show
        setPending(undefined);
        if (result.warnings.length === 0) {
          onLocked();
        }
      } else if (result.result === 'warnings') {
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
  }, [acknowledged, dispatch, needsAcknowledgement, onLocked, t]);

  return {
    acknowledged,
    busy,
    canConfirm:
      !busy &&
      !(reseal && !reviewed) &&
      !(needsAcknowledgement && !acknowledged),
    error,
    handleLock,
    needsAcknowledgement,
    pending,
    setAcknowledged,
  };
};

/** Since when the anchors are locked, and the warnings acknowledged then. */
const LockedSummary = ({ lock }: { lock: RtlsAnchorLock | undefined }) => {
  const { t } = useTranslation();
  const warnings = lock?.warnings ?? [];
  return (
    <>
      <Typography variant='body2'>
        {t('rtlsAnchorLock.dialog.lockedSince', {
          time:
            lock?.lockedAt === undefined
              ? '—'
              : new Date(lock.lockedAt).toLocaleString(),
        })}
      </Typography>
      {warnings.length > 0 && (
        <>
          <Typography variant='body2' sx={{ mt: 1 }}>
            {t('rtlsAnchorLock.dialog.acknowledgedWarnings')}
          </Typography>
          <IssueList lines={warnings.map((issue) => issue.text)} />
        </>
      )}
    </>
  );
};

const TITLES: Record<AnchorLockState, string> = {
  broken: 'rtlsAnchorLock.dialog.resealTitle',
  locked: 'rtlsAnchorLock.dialog.lockedTitle',
  unlocked: 'rtlsAnchorLock.dialog.lockTitle',
  unsupported: 'rtlsAnchorLock.dialog.lockTitle',
};

const RtlsAnchorLockDialog = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsLockDialogOpen);
  const lock = useSelector(getRtlsAnchorLock);
  const state = useSelector(getRtlsAnchorLockState);
  const reseal = state === 'broken';
  const locked = state === 'locked';

  const close = useCallback(() => dispatch(closeRtlsLockDialog()), [dispatch]);
  const flow = useLockFlow(open, reseal, close);

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={t(TITLES[state])}
      onClose={close}
    >
      <DialogContent data-testid='rtls-lock-dialog'>
        {reseal && (
          <>
            <Typography variant='body2'>
              {t('rtlsAnchorLock.dialog.breaks')}
            </Typography>
            <IssueList
              lines={newestBreaksFirst(lock?.breaks ?? []).map((entry) =>
                describeLockBreak(t, entry)
              )}
            />
          </>
        )}
        {locked && <LockedSummary lock={lock} />}
        {state === 'unlocked' && (
          <Typography variant='body2'>
            {t('rtlsAnchorLock.dialog.explanation')}
          </Typography>
        )}
        {(flow.pending?.length ?? 0) > 0 && (
          <>
            <Typography variant='body2' sx={{ mt: 1 }}>
              {t('rtlsAnchorLock.dialog.warnings')}
            </Typography>
            <IssueList
              lines={(flow.pending ?? []).map((issue) => issue.text)}
            />
          </>
        )}
        {!locked && flow.needsAcknowledgement && (
          <FormControlLabel
            control={
              <Checkbox
                data-testid='rtls-lock-acknowledge'
                checked={flow.acknowledged}
                disabled={flow.busy}
                onChange={(event) => flow.setAcknowledged(event.target.checked)}
              />
            }
            label={t(
              reseal
                ? 'rtlsAnchorLock.dialog.acknowledgeBreaks'
                : 'rtlsAnchorLock.dialog.acknowledgeWarnings'
            )}
          />
        )}
        {flow.error !== undefined && (
          <Alert severity='error' sx={{ mt: 1 }}>
            {flow.error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('general.action.close')}</Button>
        {(locked || reseal) && (
          <Button
            data-testid='rtls-lock-unlock'
            color='warning'
            onClick={() => {
              close();
              void dispatch(unlockRtlsAnchors());
            }}
          >
            {t('rtlsAnchorLock.dialog.unlock')}
          </Button>
        )}
        {!locked && (
          <Button
            data-testid='rtls-lock-confirm'
            color='primary'
            variant='contained'
            disabled={!flow.canConfirm}
            onClick={() => void flow.handleLock()}
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
