/**
 * @file One merged row of an RTLS role panel: status light, name, paired-drone
 * pill, per-role telemetry on the header line (a tag's solve rate and
 * percentage; an anchor's slot, state, ranging figures, warnings, input and
 * battery), the rest behind "show more", and an actions slot — the single
 * place a device's state is shown, so the tag/anchor panels need no separate
 * "health" view.
 */

import Moon from '@mui/icons-material/NightsStay';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

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
import {
  type AnchorNames,
  describeFleetHealth,
} from '~/features/rtls/fleet-health';
import {
  describeGeometryFit,
  type I18nText,
} from '~/features/rtls/geometry-utils';
import { getStatusForHealth } from '~/features/rtls/health-status';
import { isDeviceLost } from '~/features/rtls/anchor-utils';
import { getRtlsDeviceDisplayName } from '~/features/rtls/selectors';
import {
  classifyRole,
  countAnchorsInMask,
  getDeviceHealthForRole,
  isAnchorRole,
} from '~/features/rtls/stats-utils';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsFlightController,
  type RtlsTwrPeer,
} from '~/features/rtls/types';
import {
  getRtlsDeviceListStatus,
  isSleepableRtlsDevice,
  isTagOrUnknownRtlsDevice,
} from '~/features/rtls/utils';
import Bolt from '~/icons/Bolt';

import {
  AnchorRangingFigures,
  AnchorSlotBadge,
  AnchorStateChip,
  AnchorStatusCluster,
  describeAnchorDetailLines,
} from './AnchorRowParts';
import {
  type DetailLine,
  DetailLines,
  HeaderStat,
  ShowMoreButton,
} from './row-parts';

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

type DronePillText = {
  status: Status;
  label: I18nText;
  tooltip: I18nText;
  /** Server explanation of an ambiguous claim, shown instead of `tooltip`. */
  reason?: string;
};

/**
 * Pill of the drone a tag belongs to, named by the flight-controller system id
 * the tag reports also while asleep: in the drone's UAV-list status color
 * while the tag hears its flight controller, grey while the tag only
 * remembers it (asleep or powered off), a warning for an unusable claim.
 */
export const describeDronePill = (
  flightController: RtlsFlightController,
  uavStatus: Status | undefined
): DronePillText => {
  if (flightController.state === 'ambiguous') {
    const { reason, systemId } = flightController;
    return {
      status: Status.WARNING,
      label:
        systemId === undefined
          ? { key: 'rtlsFlightController.pill.ambiguousNoId' }
          : {
              key: 'rtlsFlightController.pill.ambiguous',
              values: { id: systemId },
            },
      tooltip: { key: 'rtlsFlightController.tooltip.ambiguous' },
      reason,
    };
  }

  const values = { id: flightController.systemId };
  const live = flightController.state === 'live';
  return {
    status: live ? (uavStatus ?? Status.INFO) : Status.OFF,
    label: { key: 'rtlsFlightController.pill.known', values },
    tooltip: {
      key: live
        ? 'rtlsFlightController.tooltip.live'
        : 'rtlsFlightController.tooltip.remembered',
      values,
    },
  };
};

const DronePill = ({
  flightController,
  uavStatus,
}: {
  flightController: RtlsFlightController;
  uavStatus: Status | undefined;
}) => {
  const { t } = useTranslation();
  const { label, reason, status, tooltip } = describeDronePill(
    flightController,
    uavStatus
  );
  return (
    <Tooltip content={reason ?? t(tooltip.key, tooltip.values)}>
      {/* Tippy needs a child that forwards refs, which StatusPill does not. */}
      <Box component='span'>
        <StatusPill inline status={status}>
          {t(label.key, label.values)}
        </StatusPill>
      </Box>
    </Tooltip>
  );
};

/**
 * Builds the primary line for a device row: the device name and, for a tag
 * that reports its flight controller, the drone it belongs to as a pill.
 */
export const describeDeviceWithPairedUav = (
  device: RtlsDevice,
  uavStatus: Status | undefined
): React.ReactNode =>
  device.flightController === undefined ? (
    getRtlsDeviceDisplayName(device)
  ) : (
    <Box
      component='span'
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      {getRtlsDeviceDisplayName(device)}
      <DronePill
        flightController={device.flightController}
        uavStatus={uavStatus}
      />
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
  const role = classifyRole(device.role);
  if (isAnchorRole(role)) {
    // an anchor's liveness, sleep and power state are all in its health
    return getStatusForHealth(
      getDeviceHealthForRole(role, stats, {
        online: device.online,
        age: device.age,
        sleeping: device.sleeping,
      })
    );
  }
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
  } else if (
    device.sleeping === undefined &&
    isTagOrUnknownRtlsDevice(device)
  ) {
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

/**
 * Width of a tag row's status light, name and drone pill, px: its solve
 * figures then start at the same place on every row, and the values of its
 * detail lines start right below them.
 */
const TAG_LEAD_WIDTH = 220;

/**
 * Width of an anchor row's status light, name, slot badge and state chip, px:
 * its ranging figures then line up across rows, like a tag's solve figures.
 */
const ANCHOR_LEAD_WIDTH = 300;

export type DeviceRowHandlers = {
  onShowOta: (id: string) => void;
  onShowParameters: (id: string) => void;
  onSleep: (id: string) => void;
  onWake: (id: string) => void;
};

/**
 * The per-row action cluster: sleep / wake (tags and anchors), parameters and
 * firmware update.
 */
const RowActions = ({
  busy,
  device,
  handlers,
}: {
  busy: boolean;
  device: RtlsDevice;
  handlers: DeviceRowHandlers;
}) => {
  const { t } = useTranslation();
  const anchor = isAnchorRole(classifyRole(device.role));
  const sleepTooltip = anchor ? t('rtlsAnchor.action.sleep') : 'Sleep';
  const wakeTooltip = anchor ? t('rtlsAnchor.action.wake') : 'Wake';
  return (
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
            <Tooltip content={sleepTooltip}>
              <IconButton
                data-testid='rtls-device-sleep'
                size='small'
                onClick={() => handlers.onSleep(device.id)}
              >
                <Moon fontSize='small' />
              </IconButton>
            </Tooltip>
            <Tooltip content={wakeTooltip}>
              <IconButton
                data-testid='rtls-device-wake'
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
          data-testid='rtls-device-parameters'
          size='small'
          onClick={() => handlers.onShowParameters(device.id)}
        >
          <Tune fontSize='small' />
        </IconButton>
      </Tooltip>
      <Tooltip content='Firmware update'>
        <IconButton
          data-testid='rtls-device-firmware'
          size='small'
          onClick={() => handlers.onShowOta(device.id)}
        >
          <SystemUpdate fontSize='small' />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

export type DeviceStatsRowProps = {
  /** Names of the anchors in a tag's anchor masks, by slot. */
  anchorNames?: AnchorNames;
  /** An anchor's slot in its cell (0 = initiator), when known. */
  anchorSlot?: number;
  /** Whether a sleep/wake transaction is in flight for this device. */
  busy?: boolean;
  device: RtlsDevice;
  /**
   * Whether the row shows all its telemetry rather than only its header
   * line. A row always shows everything without `onToggleExpanded`.
   */
  expanded?: boolean;
  /** Label of the geometry-agreement pill; the pill is hidden if unset. */
  geometryLabel?: string;
  /** Status coloring the geometry-agreement pill. */
  geometryStatus?: Status;
  /** Stable action handlers; the actions are hidden when omitted. */
  handlers?: DeviceRowHandlers;
  /** UWB MACs of the cell initiators, to find a responder's A0 distance. */
  initiatorMacs?: ReadonlySet<number>;
  /** Stable "show more" / "show less" toggle of a row, by device id. */
  onToggleExpanded?: (id: string) => void;
  stats: RtlsDeviceStats | undefined;
  /** Status of the paired UAV, used to color the drone pill. */
  uavStatus?: Status;
};

/** The tag rows' detail lines, behind "show more". */
const describeTagDetailLines = (
  t: ReturnType<typeof useTranslation>['t'],
  stats: RtlsDeviceStats | undefined,
  anchorNames: AnchorNames | undefined
): DetailLine[] => {
  const geometryFit = describeGeometryFit(stats);
  const anchorsSeen =
    stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);
  return [
    {
      key: 'fixAge',
      name: 'Fix age',
      value: formatNumber(stats?.fixAgeMs, 'ms', 0),
    },
    {
      key: 'clockDrift',
      name: 'Clock drift',
      value: formatNumber(stats?.clockPpm, 'ppm', 2),
    },
    {
      key: 'anchorsSeen',
      name: 'Anchors seen',
      value: String(anchorsSeen),
    },
    ...(geometryFit
      ? [
          {
            key: 'geometry',
            name: t('rtlsGeometry.telemetry'),
            value: t(geometryFit.key, geometryFit.values),
          },
        ]
      : []),
    ...describeFleetHealth(stats, anchorNames).map(({ id, status, text }) => ({
      key: id,
      // gray values throughout; a metric out of its green zone gets a dot in
      // the zone's color beside its name
      name: (
        <>
          {t(`rtlsFleetHealth.label.${id}`)}
          {(status === Status.WARNING || status === Status.ERROR) && (
            <StatusLight inline size='small' status={status} />
          )}
        </>
      ),
      value: t(text.key, text.values),
    })),
  ];
};

const NO_MACS: ReadonlySet<number> = new Set();

/**
 * One merged device row: header line (light, name, drone pill, a tag's solve
 * rate and percentage or an anchor's slot, state and ranging figures,
 * geometry pill, an anchor's warnings and input, battery, anchor bars,
 * actions), then — behind "show more" — the rest of the telemetry and the
 * caption. A lost anchor stays listed, greyed, with when it was last heard.
 */
const DeviceStatsRow = ({
  anchorNames,
  anchorSlot,
  busy = false,
  device,
  expanded = false,
  geometryLabel,
  geometryStatus,
  handlers,
  initiatorMacs = NO_MACS,
  onToggleExpanded,
  stats,
  uavStatus,
}: DeviceStatsRowProps) => {
  const { t } = useTranslation();
  const role = classifyRole(device.role);
  const anchor = isAnchorRole(role);
  const anchorsSeen =
    stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);
  const lost = anchor && isDeviceLost(device, stats);
  const showDetails = expanded || !onToggleExpanded;

  return (
    <Box
      data-testid={`rtls-device-${device.id}`}
      sx={{ px: 1, py: 1, opacity: lost ? 0.55 : 1 }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: anchor ? ANCHOR_LEAD_WIDTH : TAG_LEAD_WIDTH,
          }}
        >
          <StatusLight
            status={
              busy && anchor ? Status.WAITING : getRowStatus(device, stats)
            }
          />
          <Typography variant='subtitle2' component='div'>
            {describeDeviceWithPairedUav(device, uavStatus)}
          </Typography>
          {anchor && (
            <>
              <AnchorSlotBadge role={role} slot={anchorSlot} />
              <AnchorStateChip busy={busy} device={device} stats={stats} />
            </>
          )}
        </Box>
        {anchor ? (
          <AnchorRangingFigures
            device={device}
            initiatorMacs={initiatorMacs}
            role={role}
            stats={stats}
          />
        ) : (
          <>
            <HeaderStat
              label='Solve rate'
              value={formatNumber(stats?.solveRateHz, 'Hz')}
            />
            <HeaderStat
              label='Solve %'
              value={
                stats?.solvePct === undefined
                  ? '—'
                  : `${stats.solvePct.toFixed(0)}%`
              }
            />
          </>
        )}
        {/* the name and the figures keep left, the rest keeps right */}
        <Box sx={{ flexGrow: 1 }} />
        {geometryLabel && (
          <StatusPill inline status={geometryStatus ?? Status.OFF}>
            {geometryLabel}
          </StatusPill>
        )}
        {anchor ? (
          <AnchorStatusCluster stats={stats} />
        ) : (
          <>
            {stats?.batteryVoltage !== undefined && (
              <Box sx={{ width: 56 }}>
                <BatteryIndicator voltage={stats.batteryVoltage} />
              </Box>
            )}
            <AnchorBars
              anchorMask={stats?.anchorMask}
              anchorsSeen={anchorsSeen}
            />
          </>
        )}
        {handlers && (
          <RowActions busy={busy} device={device} handlers={handlers} />
        )}
      </Box>
      {onToggleExpanded && (
        <ShowMoreButton
          expanded={expanded}
          onClick={() => onToggleExpanded(device.id)}
        />
      )}
      <Collapse unmountOnExit in={showDetails}>
        <DetailLines
          leadWidth={anchor ? ANCHOR_LEAD_WIDTH : TAG_LEAD_WIDTH}
          lines={
            anchor
              ? describeAnchorDetailLines(t, stats)
              : describeTagDetailLines(t, stats, anchorNames)
          }
        />
        {anchor && <AnchorTelemetryRows twr={device.twr} />}
        <Typography
          variant='caption'
          color='textSecondary'
          component='div'
          sx={{ pl: 1, opacity: 0.6 }}
        >
          {describeDevice(device)}
        </Typography>
      </Collapse>
    </Box>
  );
};

/**
 * Memoized: telemetry notifications arrive at a steady cadence and replace
 * the stats-map / UAV-status-map identities on every message — per-row
 * primitive props keep the untouched rows from re-rendering with them.
 */
export default React.memo(DeviceStatsRow);
