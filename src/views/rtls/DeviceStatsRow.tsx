/**
 * @file One merged row of an RTLS role panel: status light, name, paired-drone
 * pill, per-role telemetry (inter-anchor TWR for anchors; solve stats for
 * tags) and an actions slot — the single place a device's state is shown, so
 * the tag/anchor panels need no separate "health" view.
 */

import Moon from '@mui/icons-material/NightsStay';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React from 'react';

import {
  MiniList,
  MiniListItem,
  StatusLight,
  StatusPill,
  Tooltip,
} from '@skybrush/mui-components';

import BatteryIndicator from '~/components/BatteryIndicator';
import { Status } from '~/components/semantics';
import AnchorBars from '~/features/rtls/AnchorBars';
import { getStatusForHealth } from '~/features/rtls/health-status';
import { getRtlsDeviceDisplayName } from '~/features/rtls/selectors';
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
import { getRtlsDeviceListStatus } from '~/features/rtls/utils';
import Bolt from '~/icons/Bolt';

const formatNumber = (
  value: number | undefined,
  unit: string,
  digits = 1
): string => (value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`);

/** Formats an inter-anchor TWR peer MAC for display (e.g. 0x0001). */
const formatMac = (mac: number | undefined): string =>
  mac === undefined
    ? '—'
    : `0x${mac.toString(16).padStart(4, '0').toUpperCase()}`;

/**
 * Sleep mode only applies to drones (tags): anchors have no power rails to
 * cut and no SLEEP parameter.
 */
export const isSleepableRtlsDevice = (device: RtlsDevice): boolean =>
  !device.role || device.role === 'tag';

/**
 * Builds the primary line for a device row. A device the server has paired
 * with a drone (their MAVLink traffic shares the tag's WiFi-UART bridge, so
 * they share a source IP) renders the drone id next to its name as a pill in
 * the drone's UAV-list status color; unpaired devices render just the name.
 */
export const describeDeviceWithPairedUav = (
  device: RtlsDevice,
  uavStatus: Status | undefined
): React.ReactNode =>
  device.uav === undefined ? (
    getRtlsDeviceDisplayName(device)
  ) : (
    <Box component='span' sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {getRtlsDeviceDisplayName(device)}
      <StatusPill inline status={uavStatus ?? Status.OFF}>
        drone {device.uav}
      </StatusPill>
    </Box>
  );

/**
 * The status light of a merged row: liveness and the sleep latch first
 * (`getRtlsDeviceListStatus` keeps the "unknown sleep state never renders
 * green" invariant), then — for a device that would render plain green — the
 * role-aware telemetry health refines the verdict.
 */
export const getRowStatus = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined
): Status => {
  const base = getRtlsDeviceListStatus(device);
  if (base !== 'success') {
    return base as Status;
  }
  return getStatusForHealth(
    getDeviceHealthForRole(classifyRole(device.role), stats, {
      online: device.online,
      age: device.age,
    })
  );
};

/** The caption line: system id, sleep state, firmware and parameter count. */
const describeDevice = (device: RtlsDevice): string => {
  const parts = [`system id ${device.id}`];
  if (device.sleeping) {
    parts.push('sleeping');
  } else if (device.sleeping === undefined && isSleepableRtlsDevice(device)) {
    // Distinguishes the grey "unknown" light from the grey "asleep" light.
    parts.push('sleep state unknown');
  }
  if (device.firmwareVersion) {
    parts.push(`fw ${device.firmwareVersion}`);
  }
  if (typeof device.paramCount === 'number') {
    parts.push(`${device.paramCount} params`);
  }
  return parts.join(' · ');
};

/**
 * Renders the anchor inter-anchor TWR telemetry: one row per peer anchor heard
 * on the UWB ether, showing the measured distance and its freshness. This is
 * the anchor analogue of the tag's solve stats — it proves the anchor is
 * hearing the ether.
 */
export const AnchorTelemetryRows = ({
  twr,
}: {
  twr: RtlsTwrPeer[] | undefined;
}) => {
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

export type DeviceRowHandlers = {
  onShowOta: (id: string) => void;
  onShowParameters: (id: string) => void;
  onSleep: (id: string) => void;
  onWake: (id: string) => void;
};

/**
 * The per-row action cluster: sleep / wake (sleepable devices only),
 * parameters and firmware update.
 */
const RowActions = ({
  busy,
  device,
  handlers,
}: {
  busy: boolean;
  device: RtlsDevice;
  handlers: DeviceRowHandlers;
}) => (
  <Box sx={{ whiteSpace: 'nowrap' }}>
    {/* Two fixed-intent buttons, like the sleep-all/wake-all pair above the
     * list — deliberately NOT a toggle of the current `sleeping` flag, which
     * may have changed between paint and click and would then invert the
     * user's intent. */}
    {isSleepableRtlsDevice(device) &&
      (busy ? (
        <IconButton size='small' disabled>
          <CircularProgress size={18} color='inherit' />
        </IconButton>
      ) : (
        <>
          <Tooltip content='Sleep'>
            <IconButton
              size='small'
              onClick={() => handlers.onSleep(device.id)}
            >
              <Moon fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip content='Wake'>
            <IconButton
              size='small'
              onClick={() => handlers.onWake(device.id)}
            >
              <Bolt fontSize='small' />
            </IconButton>
          </Tooltip>
        </>
      ))}
    <Tooltip content='Parameters'>
      <IconButton
        size='small'
        onClick={() => handlers.onShowParameters(device.id)}
      >
        <Tune fontSize='small' />
      </IconButton>
    </Tooltip>
    <Tooltip content='Firmware update'>
      <IconButton size='small' onClick={() => handlers.onShowOta(device.id)}>
        <SystemUpdate fontSize='small' />
      </IconButton>
    </Tooltip>
  </Box>
);

export type DeviceStatsRowProps = {
  /** Whether a sleep/wake transaction is in flight for this device. */
  busy?: boolean;
  device: RtlsDevice;
  /** Stable action handlers; the actions are hidden when omitted. */
  handlers?: DeviceRowHandlers;
  stats: RtlsDeviceStats | undefined;
  /** Status of the paired UAV, used to color the drone pill. */
  uavStatus?: Status;
};

/**
 * One merged device row: header line (light, name, drone pill, initiator
 * label, battery, anchor bars, actions), then the role-appropriate telemetry
 * and the caption.
 */
const DeviceStatsRow = ({
  busy = false,
  device,
  handlers,
  stats,
  uavStatus,
}: DeviceStatsRowProps) => {
  const role = classifyRole(device.role);
  const anchor = isAnchorRole(role);
  const anchorsSeen =
    stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);

  return (
    <Box sx={{ px: 1, py: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <StatusLight status={getRowStatus(device, stats)} />
        <Typography variant='subtitle2' sx={{ flexGrow: 1 }} component='div'>
          {describeDeviceWithPairedUav(device, uavStatus)}
        </Typography>
        {role === RtlsRole.ANCHOR_INITIATOR && (
          <Typography variant='caption' color='textSecondary'>
            initiator
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
        {handlers && (
          <RowActions busy={busy} device={device} handlers={handlers} />
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
        {describeDevice(device)}
      </Typography>
    </Box>
  );
};

/**
 * Memoized: telemetry notifications arrive at a steady cadence and replace
 * the stats-map / UAV-status-map identities on every message — per-row
 * primitive props keep the untouched rows from re-rendering with them.
 */
export default React.memo(DeviceStatsRow);
