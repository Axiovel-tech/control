/**
 * @file A device row's warning while it does not run the cell's settings.
 */

import Warning from '@mui/icons-material/Warning';
import Box from '@mui/material/Box';
import { useTranslation } from 'react-i18next';

import { Tooltip } from '@skybrush/mui-components';

import { type RtlsDevice } from './types';

/** What is wrong with a device's cell settings, as the server reports it. */
export type RtlsCellProblem = 'differ' | 'tx' | 'restart';

export const cellProblemOf = (
  device: RtlsDevice
): RtlsCellProblem | undefined => {
  if (device.cellSettings === 'restart') {
    return 'restart';
  }
  if (device.cellSettings === 'differ') {
    return device.cellSettingsDetail === undefined ? 'differ' : 'tx';
  }
  return undefined;
};

const TOOLTIPS: Record<RtlsCellProblem, string> = {
  differ: 'rtlsCellSettings.state.differ',
  tx: 'rtlsCellSettings.state.tx',
  restart: 'rtlsCellSettings.state.restart',
};

const CellSettingsIcon = ({ device }: { device: RtlsDevice }) => {
  const { t } = useTranslation();
  const problem = cellProblemOf(device);
  if (problem === undefined) {
    return null;
  }
  return (
    <Tooltip content={t(TOOLTIPS[problem])}>
      <Box
        component='span'
        data-testid='rtls-device-cell-settings'
        sx={{ display: 'flex', color: 'warning.main' }}
      >
        <Warning fontSize='small' />
      </Box>
    </Tooltip>
  );
};

export default CellSettingsIcon;
