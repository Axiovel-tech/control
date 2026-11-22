/**
 * @file The cell-settings dialog: the ranging rate and the anchors' TX level,
 * one line on what Apply does, the devices that do not run the cell's
 * settings, and why Apply is unavailable (locked anchors, an authorized show).
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { errorToString } from '~/error-handling';
import { type AppDispatch, type RootState } from '~/store/reducers';
import { type Collection } from '~/utils/collections';

import { applyRtlsCellSettings, queryRtlsCellSettings } from './cell-actions';
import {
  RTLS_RATE_PRESETS,
  RTLS_TX_GAIN_DEFAULT,
  RTLS_TX_GAIN_MAX,
  RTLS_TX_GAIN_MIN,
  type RtlsCellSettings,
} from './cell-settings';
import { cellProblemOf, type RtlsCellProblem } from './CellSettingsIcon';
import {
  getRtlsAnchorLock,
  getRtlsCellSettings,
  getRtlsDeviceDisplayName,
  isRtlsCellDialogOpen,
} from './selectors';
import { closeRtlsCellDialog } from './slice';
import { classifyRole, isAnchorRole } from './stats-utils';
import { type RtlsDevice } from './types';

const TX_LEVELS = Array.from(
  { length: RTLS_TX_GAIN_MAX - RTLS_TX_GAIN_MIN + 1 },
  (_, index) => RTLS_TX_GAIN_MIN + index
);

const PROBLEM_TEXTS: Record<RtlsCellProblem | 'offline' | 'unknown', string> = {
  differ: 'rtlsCellSettings.problem.differ',
  tx: 'rtlsCellSettings.problem.tx',
  restart: 'rtlsCellSettings.problem.restart',
  offline: 'rtlsCellSettings.problem.offline',
  unknown: 'rtlsCellSettings.problem.unknown',
};

/** "RTLS anchor A3: different settings", one per device that is not ok. */
export const listCellProblems = (
  devices: Collection<RtlsDevice>,
  cell: RtlsCellSettings | undefined
): Array<{ id: string; name: string; key: string }> =>
  devices.order.flatMap((id) => {
    const device = devices.byId[id];
    if (device === undefined || device.role === undefined) {
      return [];
    }
    const name = getRtlsDeviceDisplayName(device);
    const problem = device.online
      ? (cellProblemOf(device) ??
        (cell?.unknown.includes(id) ? 'unknown' : undefined))
      : 'offline';
    return problem === undefined
      ? []
      : [{ id, name, key: PROBLEM_TEXTS[problem] }];
  });

const RtlsCellSettingsDialog = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsCellDialogOpen);
  const cell = useSelector(getRtlsCellSettings);
  const lockedCount = useSelector(getRtlsAnchorLock)?.lockedCount ?? 0;
  const devices = useSelector((state: RootState) => state.rtls.devices);
  const problems = useMemo(
    () => listCellProblems(devices, cell),
    [cell, devices]
  );
  const hasAnchors = devices.order.some((id) =>
    isAnchorRole(classifyRole(devices.byId[id]?.role))
  );

  const [rateHz, setRateHz] = useState<number>(50);
  const [txGain, setTxGain] = useState<number>(RTLS_TX_GAIN_DEFAULT);
  const [serverReason, setServerReason] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setRateHz(cell?.rateHz ?? 50);
    setTxGain(cell?.txGain ?? RTLS_TX_GAIN_DEFAULT);
    setErrors([]);
    setServerReason(undefined);
    dispatch(queryRtlsCellSettings()).then(setServerReason, (error) =>
      setErrors([errorToString(error)])
    );
    // the form starts from the cell as the dialog opens, not as it changes
  }, [dispatch, open]);

  const close = useCallback(() => dispatch(closeRtlsCellDialog()), [dispatch]);

  const refusal =
    lockedCount > 0 ? t('rtlsCellSettings.unlockFirst') : serverReason;
  const changed = rateHz !== cell?.rateHz || txGain !== cell?.txGain;
  const canApply =
    !busy && refusal === undefined && (changed || problems.length > 0);

  const handleApply = useCallback(async () => {
    setBusy(true);
    setErrors([]);
    try {
      const result = await dispatch(
        applyRtlsCellSettings({
          rateHz,
          ...(hasAnchors ? { txGain } : {}),
        })
      );
      if (result.result === 'applied') {
        close();
      } else {
        setErrors(result.errors);
      }
    } catch (applyError) {
      setErrors([errorToString(applyError)]);
    } finally {
      setBusy(false);
    }
  }, [close, dispatch, hasAnchors, rateHz, txGain]);

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='xs'
      title={t('rtlsCellSettings.title')}
      onClose={close}
    >
      <DialogContent data-testid='rtls-cell-dialog'>
        <TextField
          select
          fullWidth
          margin='dense'
          size='small'
          label={t('rtlsCellSettings.rateLabel')}
          value={rateHz}
          disabled={busy}
          slotProps={{ htmlInput: { 'data-testid': 'rtls-cell-rate' } }}
          onChange={(event) => setRateHz(Number(event.target.value))}
        >
          {RTLS_RATE_PRESETS.map((hz) => (
            <MenuItem key={hz} value={hz}>
              {t('rtlsCellSettings.rate', { hz })}
            </MenuItem>
          ))}
        </TextField>
        {hasAnchors && (
          <TextField
            select
            fullWidth
            margin='dense'
            size='small'
            label={t('rtlsCellSettings.txLabel')}
            value={txGain}
            disabled={busy}
            slotProps={{ htmlInput: { 'data-testid': 'rtls-cell-tx' } }}
            onChange={(event) => setTxGain(Number(event.target.value))}
          >
            {TX_LEVELS.map((level) => (
              <MenuItem key={level} value={level}>
                {level === RTLS_TX_GAIN_DEFAULT
                  ? t('rtlsCellSettings.txDefault', { level })
                  : level}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Typography variant='body2' sx={{ mt: 1 }}>
          {t('rtlsCellSettings.dialog.text')}
        </Typography>
        {problems.length > 0 && (
          <ul
            data-testid='rtls-cell-problems'
            style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}
          >
            {problems.map(({ id, name, key }) => (
              <li key={id}>
                <Typography variant='body2'>{`${name}: ${t(key)}`}</Typography>
              </li>
            ))}
          </ul>
        )}
        {refusal !== undefined && (
          <Typography variant='body2' color='warning.main' sx={{ mt: 1 }}>
            {refusal}
          </Typography>
        )}
        {errors.length > 0 && (
          <Alert severity='error' sx={{ mt: 1 }}>
            {errors.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>{t('general.action.cancel')}</Button>
        <Button
          data-testid='rtls-cell-apply'
          color='primary'
          variant='contained'
          disabled={!canApply}
          onClick={() => void handleApply()}
        >
          {t('rtlsCellSettings.apply')}
        </Button>
      </DialogActions>
    </DraggableDialog>
  );
};

export default RtlsCellSettingsDialog;
