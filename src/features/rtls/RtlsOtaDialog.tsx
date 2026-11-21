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
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { errorToString } from '~/error-handling';
import { showError } from '~/features/snackbar/actions';
import { type AppDispatch, type RootState } from '~/store/reducers';

import {
  inspectRtlsOtaImage,
  queryRtlsOtaStatus,
  type RtlsImageSpecies,
  startRtlsOta,
} from './messages';
import messageHub from '~/message-hub';
import {
  canStartOta,
  getDeviceSpecies,
  type ImageInspection,
  type ImageSpeciesSource,
  resolveImageSpecies,
} from './ota-species';
import {
  areRtlsAnchorsLocked,
  getRtlsDevicesAsCollection,
  getRtlsOtaDialogDeviceId,
  getRtlsOtaJobForDevice,
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

/**
 * Asks the server about the image path once typing settles (X-RTLS-OTA
 * `inspect`). Returns the answer for the current path only: `undefined`
 * while it is pending.
 */
const useImageInspection = (
  open: boolean,
  image: string
): ImageInspection | undefined => {
  const [inspection, setInspection] = useState<ImageInspection>();
  useEffect(() => {
    if (!open || image.length === 0) {
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let result: Omit<ImageInspection, 'image'>;
        try {
          result = { species: await inspectRtlsOtaImage(messageHub, image) };
        } catch (error) {
          result = { error: errorToString(error) };
        }
        if (!cancelled) {
          setInspection({ image, ...result });
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, image]);
  return inspection?.image === image ? inspection : undefined;
};

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
          ? ` · ${t('rtlsOta.species.job', {
              species: job.species,
              source: job.speciesSource ?? '—',
            })}`
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

const SPECIES_HINTS: Record<ImageSpeciesSource, string> = {
  receipt: 'rtlsOta.species.fromReceipt',
  path: 'rtlsOta.species.fromPath',
  operator: 'rtlsOta.species.hint',
  none: 'rtlsOta.species.hint',
};

/** The species selector: locked to a receipt's species, else the operator's. */
const SpeciesSelect = ({
  disabled,
  mismatch,
  onChange,
  resolved,
}: {
  disabled: boolean;
  mismatch: boolean;
  onChange: (species: RtlsImageSpecies) => void;
  resolved: ReturnType<typeof resolveImageSpecies>;
}) => {
  const { t } = useTranslation();
  const { locked, source, species } = resolved;
  return (
    <TextField
      select
      fullWidth
      data-testid='rtls-ota-species'
      label={t('rtlsOta.species.label')}
      value={species}
      // a species the receipt names is not the operator's to flip
      disabled={disabled || locked}
      margin='normal'
      error={mismatch}
      helperText={
        mismatch
          ? t(`rtlsOta.species.mismatch.${species}`)
          : t(SPECIES_HINTS[source])
      }
      onChange={(event) => onChange(event.target.value as RtlsImageSpecies)}
    >
      <MenuItem value='tag'>{t('rtlsOta.species.tag')}</MenuItem>
      <MenuItem value='anchor'>{t('rtlsOta.species.anchor')}</MenuItem>
    </TextField>
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
  const deviceSpecies = getDeviceSpecies(
    useSelector((state: RootState) =>
      deviceId
        ? getRtlsDevicesAsCollection(state).byId[deviceId]?.role
        : undefined
    )
  );

  // a locked anchor takes no upload (inspecting an image stays possible)
  const anchorsLocked = useSelector(areRtlsAnchorsLocked);
  const lockedOut = anchorsLocked && deviceSpecies === 'anchor';

  const [image, setImage] = useState('');
  // The species the image is built for, always sent with the OTA: named by
  // the image's build receipt, as the server reads it (the selector is then
  // locked), else chosen by the operator, with the path's hint as default.
  // A new path resets the choice: it belonged to the previous image.
  const [chosenSpecies, setChosenSpecies] = useState<RtlsImageSpecies | ''>('');
  const [busy, setBusy] = useState(false);
  const trimmedImage = image.trim();
  const inspection = useImageInspection(open, trimmedImage);
  const resolved = resolveImageSpecies(
    trimmedImage,
    chosenSpecies,
    inspection?.species
  );
  const { species } = resolved;
  const mismatch =
    species !== '' && deviceSpecies !== undefined && species !== deviceSpecies;
  const active = job?.status !== undefined && ACTIVE_STATUSES.has(job.status);
  const startable =
    !busy &&
    !active &&
    !lockedOut &&
    canStartOta({ image: trimmedImage, inspection, mismatch, species });

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
    if (!deviceId || !startable || species === '') {
      return;
    }

    setBusy(true);
    try {
      const started = await startRtlsOta(
        messageHub,
        deviceId,
        trimmedImage,
        species
      );
      dispatch(setRtlsOtaJob({ id: deviceId, job: started }));
    } catch (error) {
      showError(`Failed to start OTA: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [deviceId, dispatch, species, startable, trimmedImage]);

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
            {t('rtlsAnchorLock.otaLocked')}
          </Alert>
        )}
        <TextField
          fullWidth
          label='Firmware image'
          placeholder='e.g. rtls-link-1.2.3.bin'
          value={image}
          disabled={busy || active}
          margin='normal'
          error={inspection?.error !== undefined}
          helperText={
            inspection?.error ??
            (trimmedImage.length > 0 && inspection === undefined
              ? t('rtlsOta.inspecting')
              : undefined)
          }
          onChange={(event) => {
            setImage(event.target.value);
            setChosenSpecies('');
          }}
        />
        <SpeciesSelect
          disabled={busy || active}
          mismatch={mismatch}
          resolved={resolved}
          onChange={setChosenSpecies}
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
