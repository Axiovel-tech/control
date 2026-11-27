import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import PropTypes from 'prop-types';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import {
  releaseAllUAVColors,
  releaseFleetColor,
  releaseSelectedUAVColors,
} from '~/features/light-control/actions';
import {
  getFleetColorInLightControlPanel,
  getLightControlTarget,
  isFleetColorOn,
  isLightControlActive,
} from '~/features/light-control/selectors';
import { setLightControlTarget } from '~/features/light-control/slice';
import { getSelectedUAVIds } from '~/features/uavs/selectors';
import { formatIdsAndTruncateTrailingItems } from '~/utils/formatting';

import LightControlGrid from './LightControlGrid';
import LightControlMainSwitch from './LightControlMainSwitch';

/**
 * Chooses whether the colours go to the whole fleet or to the selected drones.
 */
const TargetSwitch = ({ selectedCount, target, onChange }) => {
  const { t } = useTranslation();
  return (
    <Box sx={{ p: 1 }}>
      <ToggleButtonGroup
        exclusive
        fullWidth
        size='small'
        value={target}
        onChange={(_event, value) => {
          if (value) {
            onChange(value);
          }
        }}
      >
        <ToggleButton value='all'>{t('lightControl.target.all')}</ToggleButton>
        <ToggleButton value='selected'>
          {t('lightControl.target.selected', { count: selectedCount })}
        </ToggleButton>
      </ToggleButtonGroup>
    </Box>
  );
};

TargetSwitch.propTypes = {
  onChange: PropTypes.func,
  selectedCount: PropTypes.number,
  target: PropTypes.oneOf(['all', 'selected']),
};

/**
 * Shows which drones the colours go to while the selected drones are the
 * target, and gives drones back to the fleet colour.
 */
const SelectionStatus = ({
  active,
  overriddenCount,
  selectedIds,
  onReleaseAll,
  onReleaseSelected,
}) => {
  const { t } = useTranslation();
  return (
    <ListItem sx={{ display: 'block' }}>
      <ListItemText
        primary={
          !active
            ? t('lightControl.takeControlFirst')
            : selectedIds.length > 0
              ? formatIdsAndTruncateTrailingItems(selectedIds)
              : t('lightControl.noSelection')
        }
        secondary={t('lightControl.ownColors', { count: overriddenCount })}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
        <Button
          size='small'
          disabled={selectedIds.length === 0}
          onClick={onReleaseSelected}
        >
          {t('lightControl.release')}
        </Button>
        <Button
          size='small'
          disabled={overriddenCount === 0}
          onClick={onReleaseAll}
        >
          {t('lightControl.releaseAll')}
        </Button>
      </Box>
    </ListItem>
  );
};

SelectionStatus.propTypes = {
  active: PropTypes.bool,
  onReleaseAll: PropTypes.func,
  onReleaseSelected: PropTypes.func,
  overriddenCount: PropTypes.number,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
};

/**
 * Shows the colour of the whole fleet while all drones are the target, and
 * takes it off them without giving up the control of the lights.
 */
const FleetStatus = ({ active, color, colorOn, onRelease }) => {
  const { t } = useTranslation();
  return (
    <ListItem sx={{ display: 'block' }}>
      <ListItemText
        primary={
          !active
            ? t('lightControl.takeControlFirst')
            : colorOn
              ? t('lightControl.fleet.color', { color: color.toUpperCase() })
              : t('lightControl.fleet.released')
        }
        secondary={t('lightControl.fleet.hint')}
      />
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button size='small' disabled={!active || !colorOn} onClick={onRelease}>
          {t('lightControl.release')}
        </Button>
      </Box>
    </ListItem>
  );
};

FleetStatus.propTypes = {
  active: PropTypes.bool,
  color: PropTypes.string,
  colorOn: PropTypes.bool,
  onRelease: PropTypes.func,
};

/**
 * Panel that shows the widgets that are needed to control the LED lights on
 * the drone swarm from the GCS before or during a drone show: one colour for
 * the whole fleet, or colours of their own for the selected drones, which
 * take precedence over the fleet's.
 */
const LightControlPanel = ({
  active,
  fleetColor,
  fleetColorOn,
  onReleaseFleet,
  overriddenCount,
  selectedIds,
  target,
  onChangeTarget,
  onReleaseAll,
  onReleaseSelected,
}) => (
  <Box
    sx={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}
  >
    <List dense>
      <LightControlMainSwitch />
    </List>
    <Divider />
    <TargetSwitch
      selectedCount={selectedIds.length}
      target={target}
      onChange={onChangeTarget}
    />
    {target === 'all' && (
      <List dense>
        <FleetStatus
          active={active}
          color={fleetColor}
          colorOn={fleetColorOn}
          onRelease={onReleaseFleet}
        />
      </List>
    )}
    {target === 'selected' && (
      <List dense>
        <SelectionStatus
          active={active}
          overriddenCount={overriddenCount}
          selectedIds={selectedIds}
          onReleaseAll={onReleaseAll}
          onReleaseSelected={onReleaseSelected}
        />
      </List>
    )}
    <LightControlGrid />
  </Box>
);

LightControlPanel.propTypes = {
  active: PropTypes.bool,
  fleetColor: PropTypes.string,
  fleetColorOn: PropTypes.bool,
  onReleaseFleet: PropTypes.func,
  onChangeTarget: PropTypes.func,
  onReleaseAll: PropTypes.func,
  onReleaseSelected: PropTypes.func,
  overriddenCount: PropTypes.number,
  selectedIds: PropTypes.arrayOf(PropTypes.string),
  target: PropTypes.oneOf(['all', 'selected']),
};

export default connect(
  // mapStateToProps
  (state) => ({
    active: isLightControlActive(state),
    fleetColor: getFleetColorInLightControlPanel(state),
    fleetColorOn: isFleetColorOn(state),
    overriddenCount: Object.keys(state.uavs.lights).length,
    selectedIds: getSelectedUAVIds(state),
    target: getLightControlTarget(state),
  }),
  // mapDispatchToProps
  {
    onChangeTarget: setLightControlTarget,
    onReleaseAll: releaseAllUAVColors,
    onReleaseFleet: releaseFleetColor,
    onReleaseSelected: releaseSelectedUAVColors,
  }
)(LightControlPanel);
