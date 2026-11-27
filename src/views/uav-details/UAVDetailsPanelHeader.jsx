import AppBar from '@mui/material/AppBar';

import { makeStyles } from '@skybrush/app-theme-mui';

import { tokensOf } from '~/design/tokens';

import UAVDetailsPanelSelect from './UAVDetailsPanelSelect';
import UAVDetailsPanelTabs from './UAVDetailsPanelTabs';
import UAVDetailsPanelUAVIdSelector from './UAVDetailsPanelUAVIdSelector';

const useStyles = makeStyles((theme) => ({
  root: {
    position: 'sticky',
    top: 0,

    containerType: 'inline-size',

    flexDirection: 'row',
    justifyContent: 'space-between',

    // Partially copied from @skybrush/mui-components/lib/DialogAppBar
    backgroundColor: tokensOf(theme).surfaceRaised,
    borderBottom: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
  },

  select: {
    '@container (min-width: 525px)': {
      display: 'none',
    },
  },

  tabs: {
    '@container (max-width: 526px)': {
      display: 'none',
    },
  },
}));

/**
 * Header component for the panel that shows the widgets that are needed to
 * monitor and control one specific drone and it's devices.
 */
const UAVDetailsPanelHeader = () => {
  const classes = useStyles();

  return (
    <AppBar className={classes.root} style={{}}>
      <UAVDetailsPanelUAVIdSelector />
      <UAVDetailsPanelTabs className={classes.tabs} />
      <UAVDetailsPanelSelect className={classes.select} />
    </AppBar>
  );
};

export default UAVDetailsPanelHeader;
