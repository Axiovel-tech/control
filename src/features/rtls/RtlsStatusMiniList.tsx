/**
 * @file Compact RTLS summary shown in the header button's tooltip: the
 * overall health light plus per-role online counts and the freshness of the
 * last telemetry update.
 */

import Box from '@mui/material/Box';
import { useSelector } from 'react-redux';

import { MiniList, MiniListItem } from '@skybrush/mui-components';

import OverallRtlsStatusLight from './OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsStatsLastUpdatedAt,
  getRtlsTagDevices,
} from './selectors';
import { type RtlsDevice } from './types';

const countOnline = (devices: RtlsDevice[]): number =>
  devices.filter((device) => device.online).length;

const RtlsStatusMiniList = () => {
  const tags = useSelector(getRtlsTagDevices);
  const anchors = useSelector(getRtlsAnchorDevices);
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);

  return (
    <Box sx={{ minWidth: 160 }}>
      <Box sx={{ px: 1, py: 0.5 }}>
        <OverallRtlsStatusLight />
      </Box>
      <MiniList>
        <MiniListItem
          primaryText='Tags online'
          secondaryText={`${countOnline(tags)} / ${tags.length}`}
        />
        <MiniListItem
          primaryText='Anchors online'
          secondaryText={`${countOnline(anchors)} / ${anchors.length}`}
        />
        <MiniListItem
          primaryText='Telemetry'
          secondaryText={
            lastUpdatedAt
              ? new Date(lastUpdatedAt).toLocaleTimeString()
              : 'no updates yet'
          }
        />
      </MiniList>
    </Box>
  );
};

export default RtlsStatusMiniList;
