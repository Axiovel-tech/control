/**
 * @file Component that displays the list of known RTLS devices reported by the
 * server, together with their online state and basic firmware information.
 */

import Moon from '@mui/icons-material/NightsStay';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { StatusLight, Tooltip } from '@skybrush/mui-components';

import { listOf } from '~/components/helpers/lists';
import {
  sleepAllRtlsDevices,
  toggleRtlsDeviceSleep,
  wakeAllRtlsDevices,
} from '~/features/rtls/sleep-actions';
import { openRtlsOtaDialog, openRtlsParamDialog } from '~/features/rtls/slice';
import {
  getRtlsDeviceDisplayName,
  getRtlsDevicesInOrder,
} from '~/features/rtls/selectors';
import Bolt from '~/icons/Bolt';

/**
 * Sleep mode only applies to drones (tags): anchors have no power rails to
 * cut and no SLEEP parameter.
 */
const isSleepable = (device) => !device.role || device.role === 'tag';

/**
 * Builds the secondary text line for a device, combining firmware version and
 * parameter count when available.
 */
const describeDevice = (device) => {
  const parts = [];
  if (device.sleeping) {
    parts.push('sleeping');
  }

  if (device.firmwareVersion) {
    parts.push(`fw ${device.firmwareVersion}`);
  }

  if (typeof device.paramCount === 'number') {
    parts.push(`${device.paramCount} params`);
  }

  if (device.role) {
    parts.push(device.role);
  }

  return parts.length > 0 ? parts.join(' · ') : undefined;
};

/**
 * Presentation component for the entire RTLS device list.
 */
const RtlsDeviceListPresentation = listOf(
  (device, props) => {
    const secondaryAction = (
      <Box>
        {isSleepable(device) && (
          <Tooltip content={device.sleeping ? 'Wake' : 'Sleep'}>
            <IconButton
              edge='end'
              size='small'
              onClick={() => props.onToggleSleep(device.id, !device.sleeping)}
            >
              {device.sleeping ? (
                <Bolt fontSize='small' />
              ) : (
                <Moon fontSize='small' />
              )}
            </IconButton>
          </Tooltip>
        )}
        <Tooltip content='Parameters'>
          <IconButton
            edge='end'
            size='small'
            onClick={() => props.onShowParameters(device.id)}
          >
            <Tune fontSize='small' />
          </IconButton>
        </Tooltip>
        <Tooltip content='Firmware update'>
          <IconButton
            edge='end'
            size='small'
            onClick={() => props.onShowOta(device.id)}
          >
            <SystemUpdate fontSize='small' />
          </IconButton>
        </Tooltip>
      </Box>
    );

    return (
      <ListItem
        key={device.id}
        disablePadding
        secondaryAction={secondaryAction}
      >
        <ListItemButton>
          <StatusLight
            status={
              device.online ? (device.sleeping ? 'off' : 'success') : 'error'
            }
          />
          <ListItemText
            primary={getRtlsDeviceDisplayName(device)}
            secondary={describeDevice(device)}
          />
        </ListItemButton>
      </ListItem>
    );
  },
  {
    backgroundHint: 'No RTLS devices',
    dataProvider: 'devices',
  }
);

/**
 * React component that shows the state of the known RTLS devices in a Skybrush
 * server.
 */
const RtlsDeviceList = ({
  onShowOta,
  onShowParameters,
  onSleepAll,
  onToggleSleep,
  onWakeAll,
  ...rest
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 0.5,
        px: 1,
        py: 0.5,
      }}
    >
      <Tooltip content='Sleep all drones'>
        <IconButton size='small' onClick={onSleepAll}>
          <Moon fontSize='small' />
        </IconButton>
      </Tooltip>
      <Tooltip content='Wake all drones'>
        <IconButton size='small' onClick={onWakeAll}>
          <Bolt fontSize='small' />
        </IconButton>
      </Tooltip>
    </Box>
    <Divider />
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <RtlsDeviceListPresentation
        dense
        onShowOta={onShowOta}
        onShowParameters={onShowParameters}
        onToggleSleep={onToggleSleep}
        {...rest}
      />
    </Box>
  </Box>
);

RtlsDeviceList.propTypes = {
  onShowOta: PropTypes.func,
  onShowParameters: PropTypes.func,
  onSleepAll: PropTypes.func,
  onToggleSleep: PropTypes.func,
  onWakeAll: PropTypes.func,
};

export default connect(
  // mapStateToProps
  (state) => ({
    devices: getRtlsDevicesInOrder(state),
  }),
  // mapDispatchToProps
  {
    onShowOta: openRtlsOtaDialog,
    onShowParameters: openRtlsParamDialog,
    onSleepAll: sleepAllRtlsDevices,
    onToggleSleep: toggleRtlsDeviceSleep,
    onWakeAll: wakeAllRtlsDevices,
  }
)(RtlsDeviceList);
