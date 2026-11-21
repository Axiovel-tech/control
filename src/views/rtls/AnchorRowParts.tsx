/**
 * @file The anchor-specific parts of an RTLS device row: at a glance the slot
 * badge, state chip, ranging figures, warning badges, input source and
 * battery; behind "show more" the rest of the anchor's health telemetry.
 */

import BatteryStd from '@mui/icons-material/BatteryStd';
import SettingsEthernet from '@mui/icons-material/SettingsEthernet';
import Usb from '@mui/icons-material/Usb';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { StatusPill, Tooltip } from '@skybrush/mui-components';

import { BatteryFormatter } from '~/components/battery';
import BatteryIndicator from '~/components/BatteryIndicator';
import {
  describeAnchorBadges,
  describeAnchorState,
  describeChargeBlock,
  describeCharging,
  describeLastSeen,
  describePowerInput,
  describeResetCause,
  describeUwbStatus,
  findInitiatorPeer,
  formatInitiatorDistance,
  type InitiatorEvidence,
  isCharging,
  isDeviceLost,
  showsRangingFigures,
} from '~/features/rtls/anchor-utils';
import { RtlsRole } from '~/features/rtls/stats-utils';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsPowerInput,
  type RtlsTwrPeer,
} from '~/features/rtls/types';
import { BatteryDisplayStyle } from '~/model/settings';

import { type DetailLine, HeaderStat } from './row-parts';

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
  const { status, text } = describeAnchorState(
    device,
    stats,
    busy,
    initiatorEvidence
  );
  const lastSeen =
    !busy && isDeviceLost(device, stats)
      ? describeLastSeen(device.lastSeenAgeS ?? device.age)
      : undefined;
  return (
    <Box
      component='span'
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      <StatusPill inline data-testid='rtls-anchor-state' status={status}>
        {t(text.key, text.values)}
      </StatusPill>
      {lastSeen && (
        <Typography variant='caption' color='textSecondary' noWrap>
          {t(lastSeen.key, lastSeen.values)}
        </Typography>
      )}
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
            live
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
      {badges.map(({ id, status, text }) => (
        <StatusPill
          key={id}
          inline
          data-testid={`rtls-anchor-badge-${id}`}
          status={status}
        >
          {t(text.key, text.values)}
        </StatusPill>
      ))}
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

const describeHealthLines = (
  t: T,
  stats: RtlsDeviceStats | undefined
): DetailLine[] => {
  if (!stats) {
    return [];
  }
  const lines: DetailLine[] = [];
  const add = (key: string, value: string) =>
    lines.push({ key, name: t(`rtlsAnchor.detail.${key}`), value });

  if (
    stats.batteryVoltage !== undefined ||
    stats.batteryCurrentA !== undefined ||
    stats.batteryTemperatureC !== undefined
  ) {
    add(
      'battery',
      joinKnown([
        stats.batteryPercent === undefined
          ? undefined
          : `${Math.round(stats.batteryPercent)}%`,
        formatValue(stats.batteryVoltage, 'V', 2),
        formatValue(stats.batteryCurrentA, 'A', 2),
        formatValue(stats.batteryTemperatureC, '°C'),
      ])
    );
  }
  if (stats.charging !== undefined) {
    const charging = describeCharging(stats.charging);
    const block =
      stats.chargeBlock !== undefined && stats.chargeBlock !== 'none'
        ? describeChargeBlock(stats.chargeBlock)
        : undefined;
    add(
      'charging',
      joinKnown([t(charging.key), block ? t(block.key) : undefined])
    );
  }
  if (stats.powerInput !== undefined) {
    add('input', t(describePowerInput(stats.powerInput).key));
  }
  if (stats.uwbStatus !== undefined || stats.radioRestarts !== undefined) {
    add(
      'uwb',
      t('rtlsAnchor.value.restarts', {
        status:
          stats.uwbStatus === undefined
            ? '—'
            : t(describeUwbStatus(stats.uwbStatus).key),
        restarts: stats.radioRestarts ?? '—',
      })
    );
  }
  if (stats.tiltDeg !== undefined || stats.knocks !== undefined) {
    add(
      'motion',
      t('rtlsAnchor.value.motion', {
        tilt:
          stats.tiltDeg === undefined ? '—' : `${stats.tiltDeg.toFixed(1)}°`,
        knocks: stats.knocks ?? '—',
      })
    );
  }
  if (stats.ethernetLink !== undefined || stats.ethernetDrops !== undefined) {
    add(
      'ethernet',
      t(
        stats.ethernetLink
          ? 'rtlsAnchor.value.ethernetUp'
          : 'rtlsAnchor.value.ethernetDown',
        { drops: stats.ethernetDrops ?? '—' }
      )
    );
  }
  if (
    stats.wifiRssiDbm !== undefined ||
    stats.wifiDisconnects !== undefined ||
    stats.wifiTxErrors !== undefined
  ) {
    add(
      'wifi',
      t('rtlsAnchor.value.wifi', {
        rssi: formatValue(stats.wifiRssiDbm, 'dBm', 0) ?? '—',
        disconnects: stats.wifiDisconnects ?? '—',
        txErrors: stats.wifiTxErrors ?? '—',
      })
    );
  }
  if (stats.bootCount !== undefined || stats.resetCause !== undefined) {
    add(
      'boots',
      t('rtlsAnchor.value.boots', {
        boots: stats.bootCount ?? '—',
        cause:
          stats.resetCause === undefined
            ? '—'
            : describeResetCause(stats.resetCause),
      })
    );
  }
  return lines;
};
