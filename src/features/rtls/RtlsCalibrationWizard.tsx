/**
 * @file The anchor-geometry calibration wizard, launched from the RTLS
 * Anchors toolbar: capture a TWR window → review the fit (per-tripod move
 * suggestions, residual quality) → either go move tripods and re-capture,
 * or apply the relaxed geometry as-is — the final, explicit "Write &
 * reboot tags" step with a per-anchor preview.
 */

import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { errorToString } from '~/error-handling';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import type { AppDispatch } from '~/store/reducers';

import { syncGeometryToFleet } from './geometry-actions';
import {
  captureRtlsGeometry,
  fitRtlsGeometry,
  getRtlsCaptureStatus,
} from './messages';
import {
  getRtlsGeometryCheck,
  isRtlsCalibrationWizardOpen,
  isRtlsGeometrySyncing,
} from './selectors';
import { closeRtlsCalibrationWizard } from './slice';
import { type RtlsFitResult } from './types';

const CAPTURE_DURATION_S = 20;

type Step = 'capture' | 'fit' | 'apply' | 'done';

type CaptureProgress = {
  running: boolean;
  elapsed?: number;
  duration?: number;
  pairs?: number;
  samplesTotal?: number;
};

const formatCm = (meters: number): string =>
  `${(meters * 100).toFixed(1)} cm`;

const RtlsCalibrationWizard = () => {
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsCalibrationWizardOpen);
  const syncing = useSelector(isRtlsGeometrySyncing);
  const check = useSelector(getRtlsGeometryCheck);

  const [step, setStep] = useState<Step>('capture');
  const [busy, setBusy] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [progress, setProgress] = useState<CaptureProgress | undefined>();
  const [fit, setFit] = useState<RtlsFitResult | undefined>();
  const [reboot, setReboot] = useState(true);
  const pollTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined
  );
  // every open/close/restart bumps the session: any async continuation
  // from an EARLIER session (a late capture response, a straggler poll,
  // an outstanding fit) must be a no-op, or it would corrupt the current
  // session with stale data
  const session = useRef(0);

  const stopPolling = () => {
    if (pollTimer.current !== undefined) {
      clearInterval(pollTimer.current);
      pollTimer.current = undefined;
    }
  };

  // reset the wizard whenever it opens; invalidate + stop on close
  useEffect(() => {
    session.current += 1;
    if (open) {
      setStep('capture');
      setProgress(undefined);
      setFit(undefined);
      setBusy(false);
      setFitting(false);
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [open]);

  const close = () => dispatch(closeRtlsCalibrationWizard());

  const startPolling = (token: number) => {
    stopPolling();
    let consecutiveFailures = 0;
    pollTimer.current = setInterval(async () => {
      if (session.current !== token) {
        // NEVER touch the shared poller ref from a stale session: it may
        // already hold the CURRENT session's interval (our own interval
        // was cleared when the new session started polling)
        return;
      }
      try {
        const status = (await getRtlsCaptureStatus(
          messageHub
        )) as unknown as CaptureProgress;
        if (session.current !== token) {
          return;
        }
        consecutiveFailures = 0;
        setProgress(status);
        if (!status.running) {
          stopPolling();
          setBusy(false);
        }
      } catch (error) {
        // transient losses retry; a DEAD status stream must not leave
        // the wizard busy-locked forever
        consecutiveFailures += 1;
        if (consecutiveFailures >= 5 && session.current === token) {
          stopPolling();
          setBusy(false);
          setProgress(undefined);
          showError(`Lost the capture status: ${errorToString(error)}`);
        }
      }
    }, 2000);
  };

  const startCapture = async () => {
    const token = ++session.current; // invalidates older continuations
    setBusy(true);
    setFit(undefined);
    setProgress(undefined); // a failed restart must not resurrect old data
    try {
      const body = await captureRtlsGeometry(messageHub, {
        duration: CAPTURE_DURATION_S,
      });
      if (session.current !== token) {
        return;
      }
      setProgress(body as unknown as CaptureProgress);
      startPolling(token);
    } catch (error) {
      if (session.current === token) {
        setBusy(false);
      }
      showError(`Capture failed: ${errorToString(error)}`);
    }
  };

  const runFit = async () => {
    const token = session.current;
    setBusy(true);
    setFitting(true);
    try {
      const body = await fitRtlsGeometry(messageHub);
      if (session.current !== token) {
        return;
      }
      setFit(body as unknown as RtlsFitResult);
      setStep('fit');
    } catch (error) {
      showError(`Fit failed: ${errorToString(error)}`);
    } finally {
      if (session.current === token) {
        setBusy(false);
        setFitting(false);
      }
    }
  };

  const apply = async () => {
    if (!fit) {
      return;
    }
    const token = session.current;
    const outcome = await dispatch(
      syncGeometryToFleet({ geometry: fit.applyGeometry, reboot })
    );
    if (session.current !== token) {
      return;
    }
    if (outcome === 'failed') {
      return; // the error toast is up; stay here so the operator can retry
    }
    setStep('done');
  };

  const captureDone =
    progress !== undefined && !progress.running && (progress.pairs ?? 0) > 0;

  return (
    <Dialog open={open} fullWidth maxWidth='sm' onClose={close}>
      <DialogTitle>Anchor geometry calibration</DialogTitle>
      <DialogContent>
        {step === 'capture' && (
          <>
            <Typography variant='body2' sx={{ mb: 1 }}>
              The anchors measure each other continuously. Capture a{' '}
              {CAPTURE_DURATION_S}-second window of those ranges to
              measure the geometry the tripods actually stand in.
            </Typography>
            {progress && (
              <Typography variant='body2' sx={{ mb: 1 }}>
                {progress.running ? (
                  <>
                    <CircularProgress size={14} />{' '}
                    {`capturing… ${progress.elapsed ?? 0}/${
                      progress.duration ?? CAPTURE_DURATION_S
                    } s — ${progress.pairs ?? 0} pair(s), ${
                      progress.samplesTotal ?? 0
                    } sample(s)`}
                  </>
                ) : (
                  `capture complete: ${progress.pairs ?? 0} pair(s), ${
                    progress.samplesTotal ?? 0
                  } sample(s)`
                )}
              </Typography>
            )}
            <Button
              variant='outlined'
              disabled={fitting}
              onClick={startCapture}
            >
              {progress ? 'Restart capture' : 'Start capture'}
            </Button>
            <Button
              sx={{ ml: 1 }}
              variant='contained'
              disabled={!captureDone || busy || fitting}
              onClick={runFit}
            >
              Fit geometry
            </Button>
          </>
        )}

        {step === 'fit' && fit && (
          <>
            <Typography variant='body2' sx={{ mb: 1 }}>
              {`coverage ${fit.coverage.pairsMeasured}/${fit.coverage.pairsExpected} pairs · ` +
                `fit explains the measurements to ${formatCm(
                  fit.relaxed.rmsM
                )} RMS ` +
                `(rigid shape: ${formatCm(fit.rigid.rmsM)})`}
            </Typography>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>anchor</TableCell>
                  <TableCell align='right'>off by</TableCell>
                  <TableCell align='right'>Δx</TableCell>
                  <TableCell align='right'>Δy</TableCell>
                  <TableCell align='right'>Δz</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...fit.moves]
                  .sort((a, b) => b.distM - a.distM)
                  .map((move) => (
                    <TableRow key={move.index}>
                      <TableCell>{`A${move.index} (MAC ${move.mac})`}</TableCell>
                      <TableCell align='right'>
                        {formatCm(move.distM)}
                      </TableCell>
                      <TableCell align='right'>{formatCm(move.dxM)}</TableCell>
                      <TableCell align='right'>{formatCm(move.dyM)}</TableCell>
                      <TableCell align='right'>{formatCm(move.dzM)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
            <Typography variant='body2' sx={{ mt: 1 }}>
              Either physically move the worst tripods and re-capture, or
              accept the measured geometry as-is — the fleet then flies
              with the anchors exactly where they stand.
            </Typography>
          </>
        )}

        {step === 'apply' && fit && (
          <>
            <Typography variant='body2' sx={{ mb: 1 }}>
              The measured geometry will be written to EVERY tag. Rewritten
              tags must reboot for it to take effect.
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={reboot}
                  onChange={(event) => setReboot(event.target.checked)}
                />
              }
              label='Reboot rewritten tags (they drop off the network for a
                few seconds)'
            />
          </>
        )}

        {step === 'done' && (
          <Typography variant='body2'>
            {syncing
              ? 'writing the geometry to the fleet…'
              : check
                ? check.consistent
                  ? 'Geometry applied — the fleet checks consistent.'
                  : 'Geometry written; the automatic re-check found ' +
                    'devices still out of sync (see the Tags panel).'
                : 'Geometry written; run a consistency check on the Tags ' +
                  'panel to confirm.'}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
        {step === 'fit' && (
          <>
            <Button onClick={() => setStep('capture')}>
              Re-capture
            </Button>
            <Button
              color='primary'
              variant='contained'
              onClick={() => setStep('apply')}
            >
              Accept measured geometry…
            </Button>
          </>
        )}
        {step === 'apply' && (
          <>
            <Button onClick={() => setStep('fit')}>Back</Button>
            <Button
              color='primary'
              variant='contained'
              disabled={syncing}
              onClick={apply}
            >
              {reboot ? 'Write & reboot tags' : 'Write tags'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RtlsCalibrationWizard;
