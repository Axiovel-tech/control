/**
 * @file Live RTLS health/statistics panel. Shows an overall health light and a
 * per-device summary of solve rate, solve percentage, fix age, clock drift and
 * the per-anchor contribution to the latest fix.
 */

import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Typography from '@mui/material/Typography';
import { useSelector } from 'react-redux';

import {
  BackgroundHint,
  MiniList,
  MiniListItem,
  StatusLight,
} from '@skybrush/mui-components';

import AnchorBars from '~/features/rtls/AnchorBars';
import { getStatusForHealth } from '~/features/rtls/health-status';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsDevicesInOrder,
  getRtlsStatsById,
  getRtlsStatsLastUpdatedAt,
} from '~/features/rtls/selectors';
import {
  countAnchorsInMask,
  getDeviceHealth,
} from '~/features/rtls/stats-utils';
import { type RtlsDevice, type RtlsDeviceStats } from '~/features/rtls/types';

const formatNumber = (
  value: number | undefined,
  unit: string,
  digits = 1
): string => (value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`);

type DeviceStatsRowProps = {
  device: RtlsDevice;
  stats: RtlsDeviceStats | undefined;
};

const DeviceStatsRow = ({ device, stats }: DeviceStatsRowProps) => {
  const health = getDeviceHealth(stats, device);
  const anchorsSeen = stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);

  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StatusLight status={getStatusForHealth(health)} />
        <Typography variant='subtitle2' sx={{ flexGrow: 1 }}>
          {device.name ?? device.id}
        </Typography>
        <AnchorBars
          anchorMask={stats?.anchorMask}
          anchorsSeen={anchorsSeen}
        />
      </Box>
      <MiniList>
        <MiniListItem
          primaryText='Solve rate'
          secondaryText={formatNumber(stats?.solveRateHz, 'Hz')}
        />
        <MiniListItem
          primaryText='Solve %'
          secondaryText={
            stats?.solvePct === undefined
              ? '—'
              : `${stats.solvePct.toFixed(0)}%`
          }
        />
        <MiniListItem
          primaryText='Fix age'
          secondaryText={formatNumber(stats?.fixAgeMs, 'ms', 0)}
        />
        <MiniListItem
          primaryText='Clock drift'
          secondaryText={formatNumber(stats?.clockPpm, 'ppm', 2)}
        />
        <MiniListItem
          primaryText='Anchors seen'
          secondaryText={String(anchorsSeen)}
        />
      </MiniList>
      <Typography
        variant='caption'
        color='textSecondary'
        sx={{ pl: 1, opacity: 0.6 }}
      >
        {`system id ${device.id}`}
      </Typography>
    </Box>
  );
};

const RtlsStatsPanel = () => {
  const devices = useSelector(getRtlsDevicesInOrder);
  const statsById = useSelector(getRtlsStatsById);
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);

  if (devices.length === 0) {
    return <BackgroundHint text='No RTLS devices' />;
  }

  return (
    <Box sx={{ height: '100%', overflow: 'auto' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 1,
        }}
      >
        <OverallRtlsStatusLight />
        <Typography variant='caption' color='textSecondary'>
          {lastUpdatedAt
            ? `updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
            : 'no updates yet'}
        </Typography>
      </Box>
      <Divider />
      {devices.map((device, index) => (
        <Box key={device.id}>
          {index > 0 && <Divider />}
          <DeviceStatsRow
            device={device}
            stats={statsById[device.id]}
          />
        </Box>
      ))}
    </Box>
  );
};

export default RtlsStatsPanel;
