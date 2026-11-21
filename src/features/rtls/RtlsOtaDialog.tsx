/**
 * @file Per-device OTA (over-the-air firmware update) dialog. Queries the
 * current X-RTLS-OTA job on open, lets the operator start a job by naming an
 * image, and reflects live progress from pushed X-RTLS-OTA notifications.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import LinearProgress from '@mui/material/LinearProgress';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { showError } from '~/features/snackbar/actions';
import { type AppDispatch, type RootState } from '~/store/reducers';

import {
  queryRtlsOtaStatus,
  type RtlsImageSpecies,
  startRtlsOta,
} from './messages';
import messageHub from '~/message-hub';
import { getDeviceSpecies, resolveImageSpecies } from './ota-species';
import {
  getRtlsDevicesAsCollection,
  getRtlsOtaDialogDeviceId,
  getRtlsOtaJobForDevice,
  isRtlsOtaDialogOpen,
} from './selectors';
import { closeRtlsOtaDialog, setRtlsOtaJob } from './slice';

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

const RtlsOtaDialog = () => {
  const dispatch = useDispatch<AppDispatch>();
  const open = useSelector(isRtlsOtaDialogOpen);
  const deviceId = useSelector(getRtlsOtaDialogDeviceId);
  const job = useSelector((state: RootState) =>
    deviceId ? getRtlsOtaJobForDevice(state, deviceId) : undefined
  );

  const { t } = useTranslation();
  const deviceRole = useSelector((state: RootState) =>
    deviceId
      ? getRtlsDevicesAsCollection(state).byId[deviceId]?.role
      : undefined
  );
  const deviceSpecies = getDeviceSpecies(deviceRole);

  const [image, setImage] = useState('');
  // The species the image is built for, always sent with the OTA: settled by
  // the image path when it names one (the selector is then locked), chosen by
  // the operator only when it does not
  const [chosenSpecies, setChosenSpecies] = useState<RtlsImageSpecies | ''>('');
  const { locked: speciesLocked, species } = resolveImageSpecies(
    image,
    chosenSpecies
  );
  const [busy, setBusy] = useState(false);
  const speciesMismatch =
    species !== '' && deviceSpecies !== undefined && species !== deviceSpecies;

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
    if (
      !deviceId ||
      busy ||
      image.trim().length === 0 ||
      species === '' ||
      speciesMismatch
    ) {
      return;
    }

    setBusy(true);
    try {
      const started = await startRtlsOta(
        messageHub,
        deviceId,
        image.trim(),
        species
      );
      dispatch(setRtlsOtaJob({ id: deviceId, job: started }));
    } catch (error) {
      showError(`Failed to start OTA: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, deviceId, dispatch, image, species, speciesMismatch]);

  const handleClose = useCallback(() => {
    dispatch(closeRtlsOtaDialog());
  }, [dispatch]);

  const status = job?.status;
  const active = status !== undefined && ACTIVE_STATUSES.has(status);
  const percent = toPercent(job?.progress);

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={deviceId ? `OTA update — device ${deviceId}` : 'OTA update'}
      onClose={handleClose}
    >
      <DialogContent>
        <TextField
          fullWidth
          label='Firmware image'
          placeholder='e.g. rtls-link-1.2.3.bin'
          value={image}
          disabled={busy || active}
          margin='normal'
          onChange={(event) => setImage(event.target.value)}
        />
        <TextField
          select
          fullWidth
          data-testid='rtls-ota-species'
          label={t('rtlsOta.species.label')}
          value={species}
          // a species the path settles is not the operator's to flip
          disabled={busy || active || speciesLocked}
          margin='normal'
          error={speciesMismatch}
          helperText={
            speciesMismatch
              ? t('rtlsOta.species.mismatch', {
                  image: t(`rtlsOta.species.${species}`),
                  device: t(`rtlsOta.species.${deviceSpecies}`),
                })
              : speciesLocked
                ? t('rtlsOta.species.fromPath')
                : t('rtlsOta.species.hint')
          }
          onChange={(event) =>
            setChosenSpecies(event.target.value as RtlsImageSpecies)
          }
        >
          <MenuItem value='tag'>{t('rtlsOta.species.tag')}</MenuItem>
          <MenuItem value='anchor'>{t('rtlsOta.species.anchor')}</MenuItem>
        </TextField>

        {job && status ? (
          <Box sx={{ mt: 2 }}>
            <Typography variant='body2' color='textSecondary'>
              {`Status: ${status}`}
              {job.version ? ` · version ${job.version}` : ''}
            </Typography>
            {percent !== undefined ? (
              <LinearProgress
                variant='determinate'
                value={percent}
                sx={{ mt: 1 }}
              />
            ) : active ? (
              <LinearProgress sx={{ mt: 1 }} />
            ) : null}
            {percent !== undefined ? (
              <Typography variant='caption' color='textSecondary'>
                {`${percent}%`}
              </Typography>
            ) : null}
            {job.error ? (
              <Typography variant='body2' color='error' sx={{ mt: 1 }}>
                {job.error}
              </Typography>
            ) : null}
          </Box>
        ) : null}

        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
          <Button
            color='primary'
            variant='contained'
            disabled={
              busy ||
              active ||
              image.trim().length === 0 ||
              species === '' ||
              speciesMismatch
            }
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
