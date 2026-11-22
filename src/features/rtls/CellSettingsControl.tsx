/**
 * @file The cell-settings control in the anchors panel header: the cell's
 * ranging rate, amber with the number of devices that do not run it; a click
 * opens the dialog.
 */

import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { Tooltip } from '@skybrush/mui-components';

import { type AppDispatch } from '~/store/reducers';

import { type RtlsCellSettings } from './cell-settings';
import { getRtlsCellSettings } from './selectors';
import { openRtlsCellDialog } from './slice';

/** The devices that do not run the cell's settings. */
export const countCellDevicesNotOk = (cell: RtlsCellSettings): number =>
  cell.differ.length + cell.restart.length + cell.unknown.length;

const CellSettingsControl = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const cell = useSelector(getRtlsCellSettings);

  if (cell === undefined) {
    return null;
  }

  const rate =
    cell.reference === undefined
      ? '—'
      : cell.rateHz === undefined
        ? t('rtlsCellSettings.custom')
        : t('rtlsCellSettings.rate', { hz: cell.rateHz });
  const notOk = countCellDevicesNotOk(cell);
  return (
    <Tooltip content={t('rtlsCellSettings.title')}>
      <Button
        data-testid='rtls-anchors-panel.cell-settings'
        size='small'
        variant='outlined'
        color={notOk > 0 ? 'warning' : 'inherit'}
        sx={{ textTransform: 'none', py: 0, minWidth: 0 }}
        onClick={() => dispatch(openRtlsCellDialog())}
      >
        {notOk > 0 ? `${rate} · ${notOk}` : rate}
      </Button>
    </Tooltip>
  );
};

export default CellSettingsControl;
