/**
 * @file The lock dialog: one line, then the server's warnings with an
 * acknowledgement when it raises any, or its reason when it refuses (an
 * anchor that is not operating).
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

import { lockRtlsAnchors } from './lock-actions';
import { isRtlsLockDialogOpen } from './selectors';
import { closeRtlsLockDialog } from './slice';

const RtlsAnchorLockDialog = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsLockDialogOpen);

  // the warnings the server answered the last lock attempt with
  const [warnings, setWarnings] = useState<string[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (open) {
      setWarnings([]);
      setAcknowledged(false);
      setError(undefined);
    }
  }, [open]);

  const close = useCallback(() => dispatch(closeRtlsLockDialog()), [dispatch]);

  const handleLock = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const result = await dispatch(
        lockRtlsAnchors(warnings.length > 0 && acknowledged)
      );
      if (result.result === 'locked') {
        close();
      } else if (result.result === 'warnings') {
        setWarnings(result.warnings);
        setAcknowledged(false);
      } else {
        setError(result.error);
      }
    } catch (lockError) {
      setError(errorToString(lockError));
    } finally {
      setBusy(false);
    }
  }, [acknowledged, close, dispatch, warnings.length]);

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
