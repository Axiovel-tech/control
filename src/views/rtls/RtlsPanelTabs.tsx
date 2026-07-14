/**
 * @file Tab list for selecting a view on the RTLS Link panel.
 */

import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import { useDispatch, useSelector } from 'react-redux';

import { getSelectedTabInRtlsPanel } from '~/features/rtls/selectors';
import {
  type RtlsPanelTab,
  setSelectedTabInRtlsPanel,
} from '~/features/rtls/slice';

const TAB_LABELS: Record<RtlsPanelTab, string> = {
  devices: 'Devices',
  health: 'Health',
  positions: 'Debug Pos Estimates',
};

const RtlsPanelTabs = () => {
  const dispatch = useDispatch();
  const selectedTab = useSelector(getSelectedTabInRtlsPanel);

  return (
    <Tabs
      value={selectedTab}
      onChange={(_event, value: RtlsPanelTab) =>
        dispatch(setSelectedTabInRtlsPanel(value))
      }
    >
      {Object.entries(TAB_LABELS).map(([tab, label]) => (
        <Tab key={tab} label={label} value={tab} />
      ))}
    </Tabs>
  );
};

export default RtlsPanelTabs;
