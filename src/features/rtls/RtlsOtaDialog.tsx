/**
 * @file Per-device OTA (over-the-air firmware update) dialog. Queries the
 * current X-RTLS-OTA job on open, lets the operator start a job by naming an
 * image, and reflects live progress from pushed X-RTLS-OTA notifications.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { showError } from '~/features/snackbar/actions';
import { type AppDispatch, type RootState } from '~/store/reducers';

import { queryRtlsOtaStatus, startRtlsOta } from './messages';
import messageHub from '~/message-hub';
import {
  getRtlsOtaDialogDeviceId,
  getRtlsOtaJobForDevice,
  isRtlsDeviceLockedOut,
  isRtlsOtaDialogOpen,
} from './selectors';
import { closeRtlsOtaDialog, setRtlsOtaJob } from './slice';
import { type RtlsOtaJob } from './types';

/**
 * Normalises an OTA progress value to an integer percentage. The X-RTLS-OTA
 * server reports `job.progress` as a fraction in [0, 1] (0.0 at start, 1.0 on
 * completion), so it is scaled unconditionally and clamped to [0, 100]. This
 * avoids the 0–1 boundary ambiguity of a dual fraction/percentage heuristic.
 */
const toPercent = (progress: number | undefined): number | undefined => {
  if (progress === undefined || !Number.isFinite(progress)) {
    return undefined;
  }

  return Math.round(Math.min(1, Math.max(0, progress)) * 100);
};

const ACTIVE_STATUSES = new Set(['pending', 'inProgress']);

/** The current job: status, version, species, progress and error. */
const OtaJobStatus = ({ job }: { job: RtlsOtaJob }) => {
  const { t } = useTranslation();
  const active = job.status !== undefined && ACTIVE_STATUSES.has(job.status);
  const percent = toPercent(job.progress);
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant='body2' color='textSecondary'>
        {`Status: ${job.status}`}
        {job.version ? ` · version ${job.version}` : ''}
        {job.species
          ? ` · ${t('rtlsOta.species.job', { species: job.species })}`
          : ''}
      </Typography>
      {percent !== undefined ? (
        <>
          <LinearProgress
            variant='determinate'
            value={percent}
            sx={{ mt: 1 }}
          />
          <Typography variant='caption' color='textSecondary'>
            {`${percent}%`}
          </Typography>
        </>
      ) : (
        active && <LinearProgress sx={{ mt: 1 }} />
      )}
      {job.error && (
        <Typography variant='body2' color='error' sx={{ mt: 1 }}>
          {job.error}
        </Typography>
      )}
    </Box>
  );
};

const RtlsOtaDialog = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const open = useSelector(isRtlsOtaDialogOpen);
  const deviceId = useSelector(getRtlsOtaDialogDeviceId);
  const job = useSelector((state: RootState) =>
    deviceId ? getRtlsOtaJobForDevice(state, deviceId) : undefined
  );
  // a locked anchor takes no upload
  const lockedOut = useSelector(
    (state: RootState) =>
      deviceId !== undefined && isRtlsDeviceLockedOut(state, deviceId)
  );
  const [image, setImage] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmedImage = image.trim();
  const active = job?.status !== undefined && ACTIVE_STATUSES.has(job.status);
  const startable = !busy && !active && !lockedOut && trimmedImage.length > 0;

  // Query the current OTA job status when the dialog opens for a device.
  useEffect(() => {
    if (open && deviceId) {
      void (async () => {
        try {
          const current = await queryRtlsOtaStatus(messageHub, deviceId);
          dispatch(setRtlsOtaJob({ id: deviceId, job: current }));
        } catch {
          /* tolerate query failures; the operator can still start a job */
        }
      })();
    }
  }, [open, deviceId, dispatch]);

  const handleStart = useCallback(async () => {
    if (!deviceId || !startable) {
      return;
    }

    setBusy(true);
    try {
      const started = await startRtlsOta(messageHub, deviceId, trimmedImage);
      dispatch(setRtlsOtaJob({ id: deviceId, job: started }));
    } catch (error) {
      showError(`Failed to start OTA: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [deviceId, dispatch, startable, trimmedImage]);

  const handleClose = useCallback(() => {
    dispatch(closeRtlsOtaDialog());
  }, [dispatch]);

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={deviceId ? `OTA update — device ${deviceId}` : 'OTA update'}
      onClose={handleClose}
    >
      <DialogContent>
        {lockedOut && (
          <Alert
            data-testid='rtls-ota-dialog.locked'
            severity='info'
            sx={{ mb: 1 }}
          >
            {t('rtlsAnchorLock.locked')}
          </Alert>
        )}
        <TextField
          fullWidth
          label='Firmware image'
          placeholder='e.g. rtls-link-1.2.3.bin'
          value={image}
          disabled={busy || active}
          margin='normal'
          onChange={(event) => setImage(event.target.value)}
        />

        {job?.status && <OtaJobStatus job={job} />}

        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button
            color='primary'
            variant='contained'
            disabled={!startable}
            onClick={() => void handleStart()}
          >
            Start update
          </Button>
        </DialogActions>
      </DialogContent>
    </DraggableDialog>
  );
};

export default RtlsOtaDialog;
