/**
 * @file Component that displays the list of known RTLS devices reported by the
 * server, together with their online state and basic firmware information.
 */

import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

import { StatusLight } from '@skybrush/mui-components';

import { multiSelectableListOf } from '~/components/helpers/lists';
import { setSelectedRtlsDeviceIds } from '~/features/rtls/slice';
import {
  getRtlsDeviceDisplayName,
  getRtlsDevicesInOrder,
  getSelectedRtlsDeviceIds,
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
const RtlsDeviceListPresentation = multiSelectableListOf(
  (device, props, selected) => (
    <ListItem disablePadding>
      <ListItemButton
        key={device.id}
        className={selected ? 'selected-list-item' : undefined}
        onClick={props.onItemSelected}
      >
        <StatusLight status={device.online ? 'success' : 'error'} />
        <ListItemText
          primary={getRtlsDeviceDisplayName(device)}
          secondary={describeDevice(device)}
        />
      </ListItemButton>
    </ListItem>
  ),
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
  onItemActivated,
  onSelectionChanged,
  selectedIds,
  ...rest
}) => (
  <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <RtlsDeviceListPresentation
        dense
        value={selectedIds || []}
        onActivate={onItemActivated}
        onChange={onSelectionChanged}
        {...rest}
      />
    </Box>
  </Box>
);

RtlsDeviceList.propTypes = {
  selectedIds: PropTypes.arrayOf(PropTypes.string).isRequired,
  onItemActivated: PropTypes.func,
  onSelectionChanged: PropTypes.func,
};

export default connect(
  // mapStateToProps
  (state) => ({
    devices: getRtlsDevicesInOrder(state),
    selectedIds: getSelectedRtlsDeviceIds(state),
  }),
  // mapDispatchToProps
  {
    onSelectionChanged: setSelectedRtlsDeviceIds,
  }
)(RtlsDeviceList);
