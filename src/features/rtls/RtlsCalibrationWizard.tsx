/**
 * @file Fast anchor-geometry calibration over one server-coordinated capture
 * of the seven responder-owned A0 range streams. Both constrained fit models
 * run server-side; the refined model is an explicit opt-in and reuses the
 * strict fit's pinned capture.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { StatusPill } from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import { errorToString } from '~/error-handling';
import { showError } from '~/features/snackbar/actions';
import messageHub from '~/message-hub';
import type { AppDispatch } from '~/store/reducers';

import { syncGeometryToFleet } from './geometry-actions';
import { fitRtlsGeometry } from './messages';
import {
  getRtlsCellIds,
  getRtlsGeometryCheck,
  isRtlsCalibrationWizardOpen,
  isRtlsGeometrySyncing,
} from './selectors';
import { closeRtlsCalibrationWizard } from './slice';
import {
  type RtlsCalibrationModel,
  type RtlsCalibrationResponse,
  type RtlsGeometryCheck,
  type RtlsGeometryFit,
} from './types';

type Step = 'measure' | 'review' | 'apply' | 'done';

const formatM = (meters: number): string => `${meters.toFixed(3)} m`;
const formatCm = (meters: number): string => `${(meters * 100).toFixed(1)} cm`;
const formatMac = (mac: number): string =>
  `0x${Math.trunc(mac).toString(16).padStart(4, '0').toUpperCase()}`;

type FitPanelProps = {
  fit: RtlsGeometryFit;
  selected: boolean;
};

const FitParameters = ({ fit }: { fit: RtlsGeometryFit }) => {
  const { t } = useTranslation();
  const entries =
    fit.model === 'strict'
      ? [
          [t('rtlsCalibration.parameter.length'), fit.parameters.lengthM],
          [t('rtlsCalibration.parameter.width'), fit.parameters.widthM],
          [t('rtlsCalibration.parameter.height'), fit.parameters.heightM],
        ]
      : [
          [
            t('rtlsCalibration.parameter.bottomLength'),
            fit.parameters.bottomLengthM,
          ],
          [
            t('rtlsCalibration.parameter.bottomWidth'),
            fit.parameters.bottomWidthM,
          ],
          [t('rtlsCalibration.parameter.topLength'), fit.parameters.topLengthM],
          [t('rtlsCalibration.parameter.topWidth'), fit.parameters.topWidthM],
          [t('rtlsCalibration.parameter.height'), fit.parameters.heightM],
        ];

  return (
    <Typography variant='body2'>
      {entries
        .map(([label, value]) => `${label}: ${formatM(Number(value))}`)
        .join(' · ')}
      {fit.model === 'refined'
        ? ` · ${t('rtlsCalibration.parameter.angle')}: ${fit.parameters.angleDeg.toFixed(2)}°`
        : ''}
    </Typography>
  );
};

const FitPanel = ({ fit, selected }: FitPanelProps) => {
  const { t } = useTranslation();

  return (
    <Box>
      <Stack direction='row' spacing={1} alignItems='center' sx={{ mb: 0.5 }}>
        <Typography variant='subtitle2'>
          {t(`rtlsCalibration.model.${fit.model}`)}
        </Typography>
        <StatusPill
          inline
          status={fit.accepted ? Status.SUCCESS : Status.ERROR}
        >
          {fit.accepted
            ? t('rtlsCalibration.fit.accepted')
            : t('rtlsCalibration.fit.rejected')}
        </StatusPill>
        {selected && (
          <StatusPill inline status={Status.INFO}>
            {t('rtlsCalibration.fit.selected')}
          </StatusPill>
        )}
      </Stack>
      <FitParameters fit={fit} />
      <Typography variant='body2' color='textSecondary'>
        {t('rtlsCalibration.fit.quality', {
          rms: formatCm(fit.rmsM),
          objective: fit.weightedObjective.toFixed(3),
        })}
      </Typography>
      {fit.reasons.map((reason) => (
        <Alert severity='error' key={reason} sx={{ mt: 1 }}>
          {reason}
        </Alert>
      ))}
      {fit.warnings.map((warning) => (
        <Alert severity='warning' key={warning} sx={{ mt: 1 }}>
          {warning}
        </Alert>
      ))}
      <Table size='small' sx={{ mt: 1 }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('rtlsCalibration.residual.anchor')}</TableCell>
            <TableCell align='right'>
              {t('rtlsCalibration.residual.measured')}
            </TableCell>
            <TableCell align='right'>
              {t('rtlsCalibration.residual.predicted')}
            </TableCell>
            <TableCell align='right'>
              {t('rtlsCalibration.residual.error')}
            </TableCell>
            <TableCell align='right'>
              {t('rtlsCalibration.residual.mad')}
            </TableCell>
            <TableCell align='right'>
              {t('rtlsCalibration.residual.samples')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {fit.residuals.map((residual) => (
            <TableRow key={residual.anchorIndex}>
              <TableCell>
                {`A0–A${residual.anchorIndex} (${formatMac(residual.peerMac)})`}
              </TableCell>
              <TableCell align='right'>{formatM(residual.measuredM)}</TableCell>
              <TableCell align='right'>
                {formatM(residual.predictedM)}
              </TableCell>
              <TableCell align='right'>
                {formatCm(residual.residualM)}
              </TableCell>
              <TableCell align='right'>{formatCm(residual.madM)}</TableCell>
              <TableCell align='right'>{residual.count}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

type CalibrationDoneMessageProps = {
  syncing: boolean;
  check: RtlsGeometryCheck | undefined;
};

/**
 * Body of the `done` step. The wizard switches to this step the instant the
 * fleet write STARTS (not after it finishes), so while `syncing` is true this
 * shows the same spinner + status-text treatment the `measure` step uses for
 * the strict request — the operator sees an active "Writing…" indicator for
 * the whole write + reboot + consistency re-check window. Once the sync
 * settles (`syncing` flips false) it renders the consistency verdict.
 */
export const CalibrationDoneMessage = ({
  syncing,
  check,
}: CalibrationDoneMessageProps) => {
  const { t } = useTranslation();

  if (syncing) {
    return (
      <Typography
        variant='body2'
        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
      >
        <CircularProgress size={16} />
        {t('rtlsCalibration.done.writing')}
      </Typography>
    );
  }

  return (
    <Typography variant='body2'>
      {check
        ? check.consistent
          ? t('rtlsCalibration.done.consistent')
          : t('rtlsCalibration.done.outOfSync')
        : t('rtlsCalibration.done.unchecked')}
    </Typography>
  );
};

const RtlsCalibrationWizard = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsCalibrationWizardOpen);
  const syncing = useSelector(isRtlsGeometrySyncing);
  const check = useSelector(getRtlsGeometryCheck);
  const cells = useSelector(getRtlsCellIds);
  const cellSignature = cells.join('\n');

  const [step, setStep] = useState<Step>('measure');
  const [busyModel, setBusyModel] = useState<RtlsCalibrationModel>();
  const [failure, setFailure] = useState<string>();
  const [strictResponse, setStrictResponse] =
    useState<RtlsCalibrationResponse>();
  const [refinedResponse, setRefinedResponse] =
    useState<RtlsCalibrationResponse>();
  const [selectedModel, setSelectedModel] =
    useState<RtlsCalibrationModel>('strict');
  const [selectedCell, setSelectedCell] = useState('');
  const [reboot, setReboot] = useState(true);
  const session = useRef(0);

  useEffect(() => {
    session.current += 1;
    if (open) {
      setStep('measure');
      setBusyModel(undefined);
      setFailure(undefined);
      setStrictResponse(undefined);
      setRefinedResponse(undefined);
      setSelectedModel('strict');
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const availableCells = cellSignature ? cellSignature.split('\n') : [];
    setSelectedCell((current) =>
      availableCells.includes(current) ? current : (availableCells[0] ?? '')
    );
  }, [cellSignature, open]);

  const close = () => {
    session.current += 1;
    dispatch(closeRtlsCalibrationWizard());
  };

  const runStrictFit = async () => {
    if (!selectedCell) {
      return;
    }
    const token = ++session.current;
    setBusyModel('strict');
    setFailure(undefined);
    setStrictResponse(undefined);
    setRefinedResponse(undefined);
    setSelectedModel('strict');
    try {
      const response = await fitRtlsGeometry(messageHub, {
        mode: 'strict',
        cell: selectedCell,
      });
      if (session.current !== token) {
        return;
      }
      setStrictResponse(response);
      setStep('review');
    } catch (error) {
      if (session.current !== token) {
        return;
      }
      const detail = errorToString(error);
      setFailure(detail);
      showError(t('rtlsCalibration.request.failed', { detail }));
    } finally {
      if (session.current === token) {
        setBusyModel(undefined);
      }
    }
  };

  const runRefinedFit = async () => {
    if (!strictResponse) {
      return;
    }
    const token = ++session.current;
    setBusyModel('refined');
    setFailure(undefined);
    try {
      const response = await fitRtlsGeometry(messageHub, {
        mode: 'refined',
        cell: strictResponse.cell,
        captureId: strictResponse.summary.captureId,
      });
      if (session.current !== token) {
        return;
      }
      setRefinedResponse(response);
      if (
        response.selectedModel === 'refined' &&
        response.applyGeometry !== null
      ) {
        setSelectedModel('refined');
      }
    } catch (error) {
      if (session.current !== token) {
        return;
      }
      const detail = errorToString(error);
      setFailure(detail);
      showError(t('rtlsCalibration.refined.failed', { detail }));
    } finally {
      if (session.current === token) {
        setBusyModel(undefined);
      }
    }
  };

  const selectedResponse =
    selectedModel === 'refined' ? refinedResponse : strictResponse;
  const selectedFit =
    selectedModel === 'refined'
      ? refinedResponse?.refined
      : strictResponse?.strict;
  const canApply =
    selectedFit?.accepted === true &&
    selectedResponse?.selectedModel === selectedModel &&
    selectedResponse.applyGeometry !== null;

  const apply = async () => {
    if (!canApply || !selectedResponse?.applyGeometry) {
      return;
    }
    const token = session.current;
    // Switch to the `done` step as the write STARTS, before awaiting the fleet
    // write + reboot + consistency re-check, so the operator sees the active
    // "Writing…" spinner for that whole window. rtlsGeometrySyncStarted flips
    // `syncing` true synchronously inside the dispatch below, so this render
    // lands on the syncing-true branch of CalibrationDoneMessage rather than a
    // silent, greyed-out apply screen.
    setStep('done');
    const outcome = await dispatch(
      syncGeometryToFleet({
        cell: selectedResponse.cell,
        geometry: selectedResponse.applyGeometry,
        reboot,
      })
    );
    // A sync that never left the client (threw before any write) must not
    // strand the operator on a "Geometry written" verdict — roll back to the
    // apply step so they can retry. The session guard suppresses this rollback
    // when a close/remeasure raced the write.
    if (session.current === token && outcome === 'failed') {
      setStep('apply');
    }
  };

  return (
    <Dialog open={open} fullWidth maxWidth='md' onClose={close}>
      <DialogTitle>{t('rtlsCalibration.title')}</DialogTitle>
      <DialogContent>
        {step === 'measure' && (
          <Stack spacing={1.5}>
            <Typography variant='body2'>
              {t('rtlsCalibration.intro')}
            </Typography>
            <Typography variant='body2' color='textSecondary'>
              {t('rtlsCalibration.constraints')}
            </Typography>
            <FormControl fullWidth size='small'>
              <InputLabel id='rtls-calibration-cell-label'>
                {t('rtlsCalibration.cell.label')}
              </InputLabel>
              <Select
                labelId='rtls-calibration-cell-label'
                value={selectedCell}
                label={t('rtlsCalibration.cell.label')}
                disabled={busyModel !== undefined || cells.length < 2}
                onChange={(event) => setSelectedCell(event.target.value)}
              >
                {cells.map((cell) => (
                  <MenuItem value={cell} key={cell}>
                    {cell}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {cells.length === 0 && (
              <Alert severity='error'>
                {t('rtlsCalibration.cell.missing')}
              </Alert>
            )}
            {busyModel === 'strict' && (
              <Typography
                variant='body2'
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <CircularProgress size={16} />
                {t('rtlsCalibration.request.waiting')}
              </Typography>
            )}
            {failure && (
              <Alert severity='error'>
                {t('rtlsCalibration.request.actionableFailure', {
                  detail: failure,
                })}
              </Alert>
            )}
            <Box>
              <Button
                variant='contained'
                disabled={busyModel !== undefined || !selectedCell}
                onClick={() => void runStrictFit()}
              >
                {failure
                  ? t('rtlsCalibration.action.retry')
                  : t('rtlsCalibration.action.calibrate')}
              </Button>
            </Box>
          </Stack>
        )}

        {step === 'review' && strictResponse && (
          <Stack spacing={2}>
            <Alert severity='info'>
              {t('rtlsCalibration.summary', {
                captureId: strictResponse.summary.captureId,
                count: strictResponse.summary.ranges.length,
                age: strictResponse.summary.ageMs,
                skew: strictResponse.summary.maxSkewMs,
              })}
            </Alert>
            <FitPanel
              fit={strictResponse.strict}
              selected={selectedModel === 'strict'}
            />
            {refinedResponse?.refined && (
              <>
                <Box>
                  <Typography variant='subtitle2'>
                    {t('rtlsCalibration.comparison.title')}
                  </Typography>
                  <Typography variant='body2'>
                    {t('rtlsCalibration.comparison.detail', {
                      strict: formatCm(refinedResponse.strict.rmsM),
                      refined: formatCm(refinedResponse.refined.rmsM),
                      improvement: formatCm(
                        refinedResponse.comparison?.rmsImprovementM ?? 0
                      ),
                      noise: formatCm(
                        refinedResponse.comparison?.noiseFloorM ?? 0
                      ),
                    })}
                  </Typography>
                  <Typography variant='body2' color='textSecondary'>
                    {refinedResponse.comparison?.meaningfulImprovement
                      ? t('rtlsCalibration.comparison.meaningful')
                      : t('rtlsCalibration.comparison.notMeaningful')}
                  </Typography>
                </Box>
                <FitPanel
                  fit={refinedResponse.refined}
                  selected={selectedModel === 'refined'}
                />
                <Stack direction='row' spacing={1}>
                  <Button onClick={() => setSelectedModel('strict')}>
                    {t('rtlsCalibration.action.useStrict')}
                  </Button>
                  <Button
                    disabled={
                      refinedResponse.selectedModel !== 'refined' ||
                      refinedResponse.applyGeometry === null
                    }
                    onClick={() => setSelectedModel('refined')}
                  >
                    {t('rtlsCalibration.action.useRefined')}
                  </Button>
                </Stack>
              </>
            )}
            {failure && <Alert severity='error'>{failure}</Alert>}
            {!refinedResponse && (
              <Box>
                <Typography
                  variant='body2'
                  color='textSecondary'
                  sx={{ mb: 1 }}
                >
                  {t('rtlsCalibration.refined.description')}
                </Typography>
                <Button
                  variant='outlined'
                  disabled={busyModel !== undefined}
                  onClick={() => void runRefinedFit()}
                >
                  {busyModel === 'refined' && (
                    <CircularProgress size={14} sx={{ mr: 1 }} />
                  )}
                  {t('rtlsCalibration.action.runRefined')}
                </Button>
              </Box>
            )}
          </Stack>
        )}

        {step === 'apply' && selectedFit && (
          <Stack spacing={1}>
            <Alert severity='warning'>
              {t('rtlsCalibration.apply.warning', {
                model: t(`rtlsCalibration.model.${selectedFit.model}`),
              })}
            </Alert>
            <FitParameters fit={selectedFit} />
            <Typography variant='body2' color='textSecondary'>
              {t('rtlsCalibration.apply.frame')}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={reboot}
                  onChange={(event) => setReboot(event.target.checked)}
                />
              }
              label={t('rtlsCalibration.apply.reboot')}
            />
          </Stack>
        )}

        {step === 'done' && (
          <CalibrationDoneMessage syncing={syncing} check={check} />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('general.action.close')}</Button>
        {step === 'review' && (
          <>
            <Button onClick={() => setStep('measure')}>
              {t('rtlsCalibration.action.remeasure')}
            </Button>
            <Button
              color='primary'
              variant='contained'
              disabled={!canApply || busyModel !== undefined}
              onClick={() => setStep('apply')}
            >
              {t('rtlsCalibration.action.reviewApply', {
                model: t(`rtlsCalibration.model.${selectedModel}`),
              })}
            </Button>
          </>
        )}
        {step === 'apply' && (
          <>
            <Button onClick={() => setStep('review')}>
              {t('general.action.back')}
            </Button>
            <Button
              color='primary'
              variant='contained'
              disabled={syncing}
              onClick={() => void apply()}
            >
              {reboot
                ? t('rtlsCalibration.action.writeReboot')
                : t('rtlsCalibration.action.write')}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default RtlsCalibrationWizard;
