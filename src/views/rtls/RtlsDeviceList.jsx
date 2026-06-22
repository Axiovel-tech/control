/**
 * @file Component that displays the list of known RTLS devices reported by the
 * server, together with their online state and basic firmware information.
 */

import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { StatusLight, Tooltip } from '@skybrush/mui-components';

import { listOf } from '~/components/helpers/lists';
import { openRtlsOtaDialog, openRtlsParamDialog } from '~/features/rtls/slice';
import {
  getRtlsDeviceDisplayName,
  getRtlsDevicesInOrder,
} from '~/features/rtls/selectors';

/**
 * Builds the secondary text line for a device, combining firmware version and
 * parameter count when available.
 */
const describeDevice = (device) => {
  const parts = [];
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
          <StatusLight status={device.online ? 'success' : 'error'} />
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
const RtlsDeviceList = ({ onShowOta, onShowParameters, ...rest }) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <RtlsDeviceListPresentation
        dense
        onShowOta={onShowOta}
        onShowParameters={onShowParameters}
        {...rest}
      />
    </Box>
  </Box>
);

RtlsDeviceList.propTypes = {
  onShowOta: PropTypes.func,
  onShowParameters: PropTypes.func,
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
  }
)(RtlsDeviceList);
