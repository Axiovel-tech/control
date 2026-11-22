/**
 * @file The cell-settings dialog: the ranging rate and the anchors' TX level,
 * one line on what Apply does, the devices that do not run the cell's
 * settings, and why Apply is unavailable (locked anchors, no online device),
 * read live from the store.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { errorToString } from '~/error-handling';
import { type AppDispatch, type RootState } from '~/store/reducers';
import { type Collection } from '~/utils/collections';

import { applyRtlsCellSettings } from './cell-actions';
import {
  cellApplyRefusalKey,
  changedCellTarget,
  RTLS_RATE_PRESETS,
  RTLS_TX_GAIN_MAX,
  RTLS_TX_GAIN_MIN,
  type RtlsCellSettings,
  type RtlsCellTarget,
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

/** The rate select's placeholder while the cell runs no preset or has no A0. */
export const customRateText = (
  cell: RtlsCellSettings | undefined,
  t: TFunction
): string =>
  cell?.reference === undefined
    ? '—'
    : cell.blockMs === undefined
      ? t('rtlsCellSettings.custom')
      : t('rtlsCellSettings.customBlock', { ms: cell.blockMs });

/** The TX field's value, when it is a gain index the firmware accepts. */
const parseTxGain = (text: string): number | undefined => {
  const value = Number(text);
  return text.trim() !== '' &&
    Number.isInteger(value) &&
    value >= RTLS_TX_GAIN_MIN &&
    value <= RTLS_TX_GAIN_MAX
    ? value
    : undefined;
};

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
  const anyOnline = devices.order.some((id) => devices.byId[id]?.online);

  const [opened, setOpened] = useState<RtlsCellTarget>({});
  const [rateHz, setRateHz] = useState<number>();
  const [txText, setTxText] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOpened({ rateHz: cell?.rateHz, txGain: cell?.txGain });
    setRateHz(cell?.rateHz);
    setTxText(cell?.txGain === undefined ? '' : String(cell.txGain));
    setErrors([]);
    // the form starts from the cell as the dialog opens, not as it changes
  }, [open]);

  const close = useCallback(() => dispatch(closeRtlsCellDialog()), [dispatch]);

  const txGain = parseTxGain(txText);
  const txInvalid = hasAnchors && txText !== '' && txGain === undefined;
  const target = changedCellTarget(opened, {
    rateHz,
    txGain: hasAnchors ? txGain : undefined,
  });
  const refusalKey = cellApplyRefusalKey({ lockedCount, anyOnline });
  const canApply =
    !busy &&
    !txInvalid &&
    refusalKey === undefined &&
    (Object.keys(target).length > 0 || problems.length > 0);

  const handleApply = useCallback(async () => {
    setBusy(true);
    setErrors([]);
    try {
      const result = await dispatch(applyRtlsCellSettings(target));
      if (result?.result === 'applied') {
        close();
      } else if (result !== undefined) {
        setErrors(result.errors);
      }
    } catch (applyError) {
      setErrors([errorToString(applyError)]);
    } finally {
      setBusy(false);
    }
  }, [close, dispatch, target]);

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
          value={rateHz ?? ''}
          disabled={busy}
          slotProps={{ htmlInput: { 'data-testid': 'rtls-cell-rate' } }}
          onChange={(event) => setRateHz(Number(event.target.value))}
        >
          {rateHz === undefined && (
            <MenuItem disabled value=''>
              {customRateText(cell, t)}
            </MenuItem>
          )}
          {RTLS_RATE_PRESETS.map((hz) => (
            <MenuItem key={hz} value={hz}>
              {t('rtlsCellSettings.rate', { hz })}
            </MenuItem>
          ))}
        </TextField>
        {hasAnchors && (
          <TextField
            fullWidth
            margin='dense'
            size='small'
            type='number'
            label={t('rtlsCellSettings.txLabel')}
            value={txText}
            disabled={busy}
            error={txInvalid}
            helperText={t('rtlsCellSettings.txHelper')}
            slotProps={{
              htmlInput: {
                'data-testid': 'rtls-cell-tx',
                min: RTLS_TX_GAIN_MIN,
                max: RTLS_TX_GAIN_MAX,
              },
            }}
            onChange={(event) => setTxText(event.target.value)}
          />
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
        {refusalKey !== undefined && (
          <Typography variant='body2' color='warning.main' sx={{ mt: 1 }}>
            {t(refusalKey)}
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
