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

import BatteryIndicator from '~/components/BatteryIndicator';
import AnchorBars from '~/features/rtls/AnchorBars';
import { getStatusForHealth } from '~/features/rtls/health-status';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsDevicesInOrder,
  getRtlsStatsById,
  getRtlsStatsLastUpdatedAt,
} from '~/features/rtls/selectors';
import {
  classifyRole,
  countAnchorsInMask,
  getDeviceHealthForRole,
  isAnchorRole,
  RtlsRole,
} from '~/features/rtls/stats-utils';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsTwrPeer,
} from '~/features/rtls/types';

const formatNumber = (
  value: number | undefined,
  unit: string,
  digits = 1
): string => (value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`);

/** Human-readable label for a classified role, shown next to the device name. */
const ROLE_LABELS: Record<RtlsRole, string> = {
  [RtlsRole.UNKNOWN]: '',
  [RtlsRole.DISABLED]: 'Disabled',
  [RtlsRole.TAG]: 'Tag',
  [RtlsRole.ANCHOR_INITIATOR]: 'Anchor (initiator)',
  [RtlsRole.ANCHOR_RESPONDER]: 'Anchor (responder)',
};

/** Formats an inter-anchor TWR peer MAC for display (e.g. 0x0001). */
const formatMac = (mac: number | undefined): string =>
  mac === undefined
    ? '—'
    : `0x${mac.toString(16).padStart(4, '0').toUpperCase()}`;

type DeviceStatsRowProps = {
  device: RtlsDevice;
  stats: RtlsDeviceStats | undefined;
};

/**
 * Renders the anchor inter-anchor TWR telemetry: one row per peer anchor heard
 * on the UWB ether, showing the measured distance and its freshness. This is
 * the anchor analogue of the tag's solve stats — it proves the anchor is
 * hearing the ether.
 */
const AnchorTelemetryRows = ({ twr }: { twr: RtlsTwrPeer[] | undefined }) => {
  if (!twr || twr.length === 0) {
    return (
      <MiniList>
        <MiniListItem primaryText='Inter-anchor TWR' secondaryText='—' />
      </MiniList>
    );
  }
  return (
    <MiniList>
      {twr.map((peer, index) => (
        <MiniListItem
          key={peer.peerMac ?? index}
          primaryText={`Peer ${formatMac(peer.peerMac)}`}
          secondaryText={
            peer.distanceM === undefined
              ? '—'
              : `${peer.distanceM.toFixed(2)} m · ${formatNumber(
                  peer.ageMs,
                  'ms',
                  0
                )}`
          }
        />
      ))}
    </MiniList>
  );
};

const DeviceStatsRow = ({ device, stats }: DeviceStatsRowProps) => {
  const { id, role: rawRole } = device;
  const name = device.name ?? device.id;
  const role = classifyRole(rawRole);
  const anchor = isAnchorRole(role);
  const health = getDeviceHealthForRole(role, stats, {
    online: device.online,
    age: device.age,
  });
  const anchorsSeen =
    stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);
  const roleLabel = ROLE_LABELS[role];

  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StatusLight status={getStatusForHealth(health)} />
        <Typography variant='subtitle2' sx={{ flexGrow: 1 }}>
          {name}
        </Typography>
        {roleLabel && (
          <Typography variant='caption' color='textSecondary'>
            {roleLabel}
          </Typography>
        )}
        {stats?.batteryVoltage !== undefined && (
          <Box sx={{ width: 56 }}>
            <BatteryIndicator voltage={stats.batteryVoltage} />
          </Box>
        )}
        {!anchor && (
          <AnchorBars
            anchorMask={stats?.anchorMask}
            anchorsSeen={anchorsSeen}
          />
        )}
      </Box>
      {anchor ? (
        <AnchorTelemetryRows twr={device.twr} />
      ) : (
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
      )}
      <Typography
        variant='caption'
        color='textSecondary'
        sx={{ pl: 1, opacity: 0.6 }}
      >
        {`system id ${id}`}
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
          <DeviceStatsRow device={device} stats={statsById[device.id]} />
        </Box>
      ))}
    </Box>
  );
};

export default RtlsStatsPanel;
