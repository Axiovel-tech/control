import ImageBlurCircular from '@mui/icons-material/BlurCircular';
import ImageBlurOn from '@mui/icons-material/BlurOn';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Badge from '@mui/material/Badge';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Toolbar, { type ToolbarProps } from '@mui/material/Toolbar';
import isEmpty from 'lodash-es/isEmpty';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import ToolbarDivider from '~/components/ToolbarDivider';
import UAVOperationsButtonGroup from '~/components/uavs/UAVOperationsButtonGroup';
import { TooltipWithContainerFromContext as Tooltip } from '~/containerContext';
import { showFirmwareUpdateDialog } from '~/features/firmware-update/actions';
import { isBroadcast } from '~/features/session/selectors';
import { getSelectedUAVIds } from '~/features/uavs/selectors';
import type { RootState } from '~/store/reducers';

import MappingButtonGroup from './MappingButtonGroup';

type UAVToolbarProps = ToolbarProps &
  Readonly<{
    firmwareUpdateRunning: boolean;
    fitSelectedUAVs?: () => void;
    isBroadcast: boolean;
    selectedUAVIds: string[];
    showFirmwareUpdateDialog: (preselectedIds?: string[]) => void;
  }>;

/**
 * Main toolbar for controlling the UAVs.
 */
const UAVToolbar = React.forwardRef<HTMLDivElement, UAVToolbarProps>(
  (
    {
      firmwareUpdateRunning,
      fitSelectedUAVs,
      isBroadcast,
      selectedUAVIds,
      showFirmwareUpdateDialog,
      ...rest
    },
    ref
  ) => {
    const isSelectionEmpty = isEmpty(selectedUAVIds);
    const { t } = useTranslation();

    return (
      <Toolbar
        ref={ref}
        disableGutters
        variant='dense'
        // The toolbar scrolls sideways when the panel is narrower than it
        sx={{ overflowX: 'auto', scrollbarWidth: 'none' }}
        {...rest}
      >
        <Box sx={{ width: '4px' }} />

        <UAVOperationsButtonGroup
          broadcast={isBroadcast}
          selectedUAVIds={selectedUAVIds}
        />

        <ToolbarDivider orientation='vertical' />

        {/* The flight (ArduPilot) firmware update. It is always available:
         * the dialog lists every drone the server can update, with the
         * selected ones already ticked. The dot marks a running update. */}
        <Tooltip
          content={
            firmwareUpdateRunning
              ? t('UAVOpButtonGrp.firmwareUpdateRunning')
              : t('UAVOpButtonGrp.firmwareUpdate')
          }
        >
          <IconButton
            data-testid='uavs.flight-firmware-update'
            size='large'
            onClick={() => showFirmwareUpdateDialog(selectedUAVIds)}
          >
            <Badge
              color='primary'
              invisible={!firmwareUpdateRunning}
              variant='dot'
            >
              <SystemUpdate />
            </Badge>
          </IconButton>
        </Tooltip>

        <Box sx={{ flex: 1 }} />

        {fitSelectedUAVs && (
          <Tooltip
            content={
              isSelectionEmpty
                ? t('uavToolbar.fitAllFeaturesIntoView')
                : t('uavToolbar.fitSelectionIntoView')
            }
          >
            <IconButton
              style={{ float: 'right' }}
              size='large'
              onClick={fitSelectedUAVs}
            >
              {isSelectionEmpty ? <ImageBlurOn /> : <ImageBlurCircular />}
            </IconButton>
          </Tooltip>
        )}

        <MappingButtonGroup />
      </Toolbar>
    );
  }
);
UAVToolbar.displayName = 'UAVToolbar';

export default connect(
  // mapStateToProps
  (state: RootState) => ({
    firmwareUpdateRunning: state.firmwareUpdate.running,
    isBroadcast: isBroadcast(state),
    selectedUAVIds: getSelectedUAVIds(state),
  }),
  // mapDispatchToProps
  { showFirmwareUpdateDialog }
)(UAVToolbar);
