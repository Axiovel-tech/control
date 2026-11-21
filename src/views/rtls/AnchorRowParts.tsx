/**
 * @file The anchor-specific parts of an RTLS device row: at a glance the slot
 * badge, state chip, ranging figures, warning badges, input source and
 * battery; behind "show more" the rest of the anchor's health telemetry.
 */

import BatteryStd from '@mui/icons-material/BatteryStd';
import Lock from '@mui/icons-material/Lock';
import SettingsEthernet from '@mui/icons-material/SettingsEthernet';
import Usb from '@mui/icons-material/Usb';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { StatusPill, Tooltip } from '@skybrush/mui-components';

import { BatteryFormatter } from '~/components/battery';
import { type Status } from '~/components/semantics';
import BatteryIndicator from '~/components/BatteryIndicator';
import {
  describeAnchorBadges,
  describeAnchorState,
  describeChargeBlock,
  describeCharging,
  describePowerInput,
  describeResetCause,
  describeUwbStatus,
  findInitiatorPeer,
  formatInitiatorDistance,
  isCharging,
  isDeviceLost,
  showsRangingFigures,
} from '~/features/rtls/anchor-utils';
import { type InitiatorEvidence, RtlsRole } from '~/features/rtls/stats-utils';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsPowerInput,
  type RtlsTwrPeer,
} from '~/features/rtls/types';
import { BatteryDisplayStyle } from '~/model/settings';

import { type DetailLine, HeaderStat, LastSeen } from './row-parts';

/** Percent when the gauge knows it, else voltage; anchors carry one cell. */
const ANCHOR_BATTERY_FORMATTER = new BatteryFormatter({
  style: BatteryDisplayStyle.PERCENTAGE,
});

const formatValue = (
  value: number | undefined,
  unit: string,
  digits = 1
): string | undefined =>
  value === undefined ? undefined : `${value.toFixed(digits)} ${unit}`;

/** Formats a TWR peer MAC for display (e.g. 0x0100). */
const formatMac = (mac: number | undefined): string =>
  mac === undefined
    ? '—'
    : `0x${mac.toString(16).padStart(4, '0').toUpperCase()}`;

const joinKnown = (parts: Array<string | undefined>): string => {
  const known = parts.filter((part): part is string => part !== undefined);
  return known.length > 0 ? known.join(' · ') : '—';
};

const INPUT_ICONS: Partial<Record<RtlsPowerInput, React.ReactElement>> = {
  battery: <BatteryStd fontSize='small' />,
  usb: <Usb fontSize='small' />,
  'usb-1.5a': <Usb fontSize='small' />,
  'usb-3a': <Usb fontSize='small' />,
  poe: <SettingsEthernet fontSize='small' />,
};

/** A status pill, with what it means in a tooltip when there is one. */
const ExplainedPill = ({
  status,
  testId,
  text,
  tooltip,
}: {
  status: Status;
  testId: string;
  text: string;
  tooltip?: string;
}) => {
  const pill = (
    <StatusPill inline data-testid={testId} status={status}>
      {text}
    </StatusPill>
  );
  return tooltip === undefined ? (
    pill
  ) : (
    <Tooltip content={tooltip}>
      {/* Tippy needs a child that forwards refs, which StatusPill does not. */}
      <Box component='span'>{pill}</Box>
    </Tooltip>
  );
};

/** The slot badge (A0..A7) with the role in its tooltip. */
export const AnchorSlotBadge = ({
  role,
  slot,
}: {
  role: RtlsRole;
  slot: number | undefined;
}) => {
  const { t } = useTranslation();
  return (
    <Tooltip
      content={t(
        role === RtlsRole.ANCHOR_INITIATOR
          ? 'rtlsAnchor.role.initiator'
          : 'rtlsAnchor.role.responder'
      )}
    >
      <Chip
        data-testid='rtls-anchor-slot'
        size='small'
        variant='outlined'
        label={
          slot === undefined
            ? t('rtlsAnchor.role.unknownSlot')
            : t('rtlsAnchor.role.slot', { slot })
        }
      />
    </Tooltip>
  );
};

/** The state chip, with when a lost anchor was last heard beside it. */
export const AnchorStateChip = ({
  busy,
  device,
  initiatorEvidence,
  stats,
}: {
  busy: boolean;
  device: RtlsDevice;
  initiatorEvidence?: InitiatorEvidence;
  stats: RtlsDeviceStats | undefined;
}) => {
  const { t } = useTranslation();
  const { status, text, tooltip } = describeAnchorState(
    device,
    stats,
    busy,
    initiatorEvidence
  );
  return (
    <Box
      component='span'
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <ExplainedPill
        status={status}
        testId='rtls-anchor-state'
        text={t(text.key, text.values)}
        tooltip={tooltip && t(tooltip.key, tooltip.values)}
      />
      {!busy && isDeviceLost(device) && <LastSeen device={device} />}
    </Box>
  );
};

/**
 * The ranging figures of the header line: the ranging rate and, on a
 * responder, its distance to A0 with the spread. Dashes while the anchor
 * rests or is lost, so the columns stay in place.
 */
export const AnchorRangingFigures = ({
  device,
  initiatorMacs,
  role,
  stats,
}: {
  device: RtlsDevice;
  initiatorMacs: ReadonlySet<number>;
  role: RtlsRole;
  stats: RtlsDeviceStats | undefined;
}) => {
  const { t } = useTranslation();
  const live = showsRangingFigures(device, stats);
  return (
    <>
      <HeaderStat
        label={t('rtlsAnchor.header.rate')}
        value={
          (live ? formatValue(stats?.rangingRateHz, 'Hz') : undefined) ?? '—'
        }
      />
      {role === RtlsRole.ANCHOR_RESPONDER && (
        <HeaderStat
          label={t('rtlsAnchor.header.initiator')}
          value={
            // a distance is live only while the responder measures A0
            live && (stats?.rangingRateHz ?? 0) > 0
              ? formatInitiatorDistance(
                  findInitiatorPeer(device.twr, initiatorMacs)
                )
              : '—'
          }
        />
      )}
    </>
  );
};

/** The warning badges, the input source and the battery. */
export const AnchorStatusCluster = ({
  stats,
}: {
  stats: RtlsDeviceStats | undefined;
}) => {
  const { t } = useTranslation();
  const badges = describeAnchorBadges(stats);
  const input = stats?.powerInput;
  const inputIcon = input === undefined ? undefined : INPUT_ICONS[input];
  const haveBattery =
    stats?.batteryPercent !== undefined || stats?.batteryVoltage !== undefined;
  return (
    <>
      {badges.map(({ id, status, text, tooltip }) => (
        <ExplainedPill
          key={id}
          status={status}
          testId={`rtls-anchor-badge-${id}`}
          text={t(text.key, text.values)}
          tooltip={tooltip && t(tooltip.key, tooltip.values)}
        />
      ))}
      {stats?.locked && !stats.stale && (
        <Tooltip content={t('rtlsAnchorLock.control.locked')}>
          <Box
            component='span'
            data-testid='rtls-anchor-locked'
            sx={{ display: 'flex', color: 'text.secondary' }}
          >
            <Lock fontSize='small' />
          </Box>
        </Tooltip>
      )}
      {input !== undefined && inputIcon && (
        <Tooltip content={t(describePowerInput(input).key)}>
          <Box
            component='span'
            data-testid={`rtls-anchor-input-${input}`}
            sx={{ display: 'flex', color: 'text.secondary' }}
          >
            {inputIcon}
          </Box>
        </Tooltip>
      )}
      {haveBattery && (
        <Box sx={{ width: 56 }}>
          <BatteryIndicator
            cellCount={1}
            charging={isCharging(stats?.charging)}
            formatter={ANCHOR_BATTERY_FORMATTER}
            percentage={stats?.batteryPercent}
            voltage={stats?.batteryVoltage}
          />
        </Box>
      )}
    </>
  );
};

type T = ReturnType<typeof useTranslation>['t'];

/**
 * The anchor's detail lines: battery, charging, input, UWB, motion, links
 * and boots, each only when the anchor reports it, then one line per TWR
 * peer it hears (distance, spread and freshness).
 */
export const describeAnchorDetailLines = (
  t: T,
  stats: RtlsDeviceStats | undefined,
  twr: RtlsTwrPeer[] | undefined
): DetailLine[] => {
  const lines: DetailLine[] = [
    ...describeHealthLines(t, stats),
    ...(twr ?? []).map((peer, index) => ({
      key: `peer-${peer.peerMac ?? index}`,
      name: t('rtlsAnchor.detail.peer', { mac: formatMac(peer.peerMac) }),
      value: joinKnown([
        peer.distanceM === undefined
          ? undefined
          : formatInitiatorDistance(peer),
        peer.count === undefined
          ? undefined
          : t('rtlsAnchor.value.samples', { count: peer.count }),
        formatValue(peer.ageMs, 'ms', 0),
      ]),
    })),
  ];
  return lines;
};

const anyKnown = (...values: unknown[]): boolean =>
  values.some((value) => value !== undefined);

const dash = (value: number | string | undefined): number | string =>
  value ?? '—';

type DetailGroup = (t: T, stats: RtlsDeviceStats) => string | undefined;

const batteryLine: DetailGroup = (_t, stats) =>
  anyKnown(
    stats.batteryVoltage,
    stats.batteryCurrentA,
    stats.batteryTemperatureC
  )
    ? joinKnown([
        stats.batteryPercent === undefined
          ? undefined
          : `${Math.round(stats.batteryPercent)}%`,
        formatValue(stats.batteryVoltage, 'V', 2),
        formatValue(stats.batteryCurrentA, 'A', 2),
        formatValue(stats.batteryTemperatureC, '°C'),
      ])
    : undefined;

const chargingLine: DetailGroup = (t, stats) => {
  if (stats.charging === undefined) {
    return undefined;
  }
  const block =
    stats.chargeBlock !== undefined && stats.chargeBlock !== 'none'
      ? t(describeChargeBlock(stats.chargeBlock).key)
      : undefined;
  return joinKnown([t(describeCharging(stats.charging).key), block]);
};

const inputLine: DetailGroup = (t, stats) =>
  stats.powerInput === undefined
    ? undefined
    : t(describePowerInput(stats.powerInput).key);

const uwbLine: DetailGroup = (t, stats) =>
  anyKnown(stats.uwbStatus, stats.radioRestarts)
    ? t('rtlsAnchor.value.restarts', {
        status:
          stats.uwbStatus === undefined
            ? '—'
            : t(describeUwbStatus(stats.uwbStatus).key),
        restarts: dash(stats.radioRestarts),
      })
    : undefined;

const motionLine: DetailGroup = (t, stats) =>
  anyKnown(stats.tiltDeg, stats.knocks)
    ? t('rtlsAnchor.value.motion', {
        tilt:
          stats.tiltDeg === undefined ? '—' : `${stats.tiltDeg.toFixed(1)}°`,
        knocks: dash(stats.knocks),
      })
    : undefined;

const ethernetLine: DetailGroup = (t, stats) =>
  anyKnown(stats.ethernetLink, stats.ethernetDrops)
    ? t(
        stats.ethernetLink
          ? 'rtlsAnchor.value.ethernetUp'
          : 'rtlsAnchor.value.ethernetDown',
        { drops: dash(stats.ethernetDrops) }
      )
    : undefined;

const wifiLine: DetailGroup = (t, stats) =>
  anyKnown(stats.wifiRssiDbm, stats.wifiDisconnects, stats.wifiTxErrors)
    ? t('rtlsAnchor.value.wifi', {
        rssi: dash(formatValue(stats.wifiRssiDbm, 'dBm', 0)),
        disconnects: dash(stats.wifiDisconnects),
        txErrors: dash(stats.wifiTxErrors),
      })
    : undefined;

const bootsLine: DetailGroup = (t, stats) =>
  anyKnown(stats.bootCount, stats.resetCause)
    ? t('rtlsAnchor.value.boots', {
        boots: dash(stats.bootCount),
        cause:
          stats.resetCause === undefined
            ? '—'
            : describeResetCause(stats.resetCause),
      })
    : undefined;

/** The detail groups in display order, by their `rtlsAnchor.detail` key. */
const DETAIL_GROUPS: Array<[string, DetailGroup]> = [
  ['battery', batteryLine],
  ['charging', chargingLine],
  ['input', inputLine],
  ['uwb', uwbLine],
  ['motion', motionLine],
  ['ethernet', ethernetLine],
  ['wifi', wifiLine],
  ['boots', bootsLine],
];

const describeHealthLines = (
  t: T,
  stats: RtlsDeviceStats | undefined
): DetailLine[] =>
  stats === undefined
    ? []
    : DETAIL_GROUPS.flatMap(([key, line]) => {
        const value = line(t, stats);
        return value === undefined
          ? []
          : [{ key, name: t(`rtlsAnchor.detail.${key}`), value }];
      });
