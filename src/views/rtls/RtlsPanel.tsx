/**
 * @file The merged RTLS Link workbench panel: a tabbed container over the
 * device list (discovery, parameters, OTA) and the live health view.
 */

import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import { useSelector } from 'react-redux';

import { isThemeDark, makeStyles } from '@skybrush/app-theme-mui';

import { getSelectedTabInRtlsPanel } from '~/features/rtls/selectors';
import { type RtlsPanelTab } from '~/features/rtls/slice';

import RtlsDeviceList from './RtlsDeviceList';
import RtlsPanelTabs from './RtlsPanelTabs';
import RtlsPositionsPanel from './RtlsPositionsPanel';
import RtlsStatsPanel from './RtlsStatsPanel';

const useStyles = makeStyles((theme) => ({
  header: {
    position: 'sticky',
    top: 0,
    flexDirection: 'row',

    // Partially copied from @skybrush/mui-components/lib/DialogAppBar, like
    // the UAV details panel header.
    backgroundColor: isThemeDark(theme) ? '#535353' : '#fff',
    color: isThemeDark(theme)
      ? theme.palette.getContrastText('#535353')
      : '#000',
  },
}));

const views: Record<RtlsPanelTab, React.ComponentType> = {
  devices: RtlsDeviceList,
  health: RtlsStatsPanel,
  positions: RtlsPositionsPanel,
};

const RtlsPanel = () => {
  const classes = useStyles();
  const selectedTab = useSelector(getSelectedTabInRtlsPanel);
  const Body = views[selectedTab];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <AppBar className={classes.header} style={{}}>
        <RtlsPanelTabs />
      </AppBar>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Body />
      </Box>
    </Box>
  );
};

export default RtlsPanel;
