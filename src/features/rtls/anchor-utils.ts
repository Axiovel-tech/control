/**
 * @file Pure helpers behind an anchor row: its slot badge, state chip,
 * warning badges and detail values, as i18n keys with values so they can be
 * tested without rendering.
 */

import { Status } from '~/components/semantics';

import { type I18nText } from './i18n-text';
import {
  classifyRole,
  type InitiatorEvidence,
  isAnchorResting,
  isRangeDanger,
  isRangeDeviating,
  isRangingByTelemetry,
  isUwbStartRefused,
  RtlsRole,
  wasPoweringDown,
} from './stats-utils';
import {
  type RtlsAnchor,
  type RtlsChargeBlock,
  type RtlsChargingState,
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsPowerInput,
  type RtlsTwrPeer,
  RtlsUwbStatus,
} from './types';

/** A short label with the status that colors it, and what it means. */
export type StatusText = { status: Status; text: I18nText; tooltip?: I18nText };

/** A warning badge of an anchor row. */
export type AnchorBadge = StatusText & { id: string };

const ANCHOR_NAME_SLOT = /\bA(\d)\b/;

/**
 * The anchor's slot in its cell (A0 is the initiator): from the site anchor
 * list (the configured table, matched by system id), else from the server's
 * `RTLS anchor A<n>` name, else 0 for the initiator. `undefined` when the
 * slot of a responder is unknown.
 */
export function getAnchorSlot(
  device: RtlsDevice,
  siteAnchors: readonly RtlsAnchor[]
): number | undefined {
  const site = siteAnchors.find(
    (anchor) => String(anchor.systemId) === String(device.id)
  );
  if (site?.index !== undefined) {
    return site.index;
  }

  const match = device.name ? ANCHOR_NAME_SLOT.exec(device.name) : null;
  if (match) {
    return Number(match[1]);
  }

  return classifyRole(device.role) === RtlsRole.ANCHOR_INITIATOR
    ? 0
    : undefined;
}

/** The UWB MACs of the initiators (slot 0) of every configured cell. */
export function getInitiatorMacs(
  siteAnchors: readonly RtlsAnchor[]
): ReadonlySet<number> {
  return new Set(
    siteAnchors
      .filter((anchor) => anchor.index === 0 && anchor.mac !== undefined)
      .map((anchor) => anchor.mac!) // non-null: filtered just above
  );
}

/**
 * A responder's TWR row towards its initiator: the peer whose MAC is an
 * initiator MAC, else the only peer it hears (a responder only ranges with
 * A0).
 */
export function findInitiatorPeer(
  twr: RtlsTwrPeer[] | undefined,
  initiatorMacs: ReadonlySet<number>
): RtlsTwrPeer | undefined {
  if (!twr || twr.length === 0) {
    return undefined;
  }
  const peer = twr.find(
    (row) => row.peerMac !== undefined && initiatorMacs.has(row.peerMac)
  );
  return peer ?? (twr.length === 1 ? twr[0] : undefined);
}

/** Formats an A0 distance with its spread, e.g. `14.10 m ±2 cm`. */
export function formatInitiatorDistance(peer: RtlsTwrPeer | undefined): string {
  if (peer?.distanceM === undefined) {
    return '—';
  }
  const distance = `${peer.distanceM.toFixed(2)} m`;
  return peer.madM === undefined
    ? distance
    : `${distance} ±${Math.round(peer.madM * 100)} cm`;
}

/** Whether a device has dropped off the network (the server's `online`). */
export const isDeviceLost = (device: RtlsDevice): boolean => !device.online;

/**
 * How long after an accepted sleep or wake a lost anchor reads as switching
 * at most: the transition may reboot it (8-15 s off the network). The first
 * new powerState it reports ends the hint sooner (`anchorPowerRequests`).
 */
export const ANCHOR_REBOOT_WINDOW_MS = 30 * 1000;

/**
 * Whether an anchor is off the network because it is rebooting into the
 * state it accepted at `requestedAt` (`Date.now()`), not lost.
 */
export const isAnchorSwitching = (
  device: RtlsDevice,
  requestedAt: number | undefined,
  now: number = Date.now()
): boolean =>
  requestedAt !== undefined &&
  isDeviceLost(device) &&
  now - requestedAt < ANCHOR_REBOOT_WINDOW_MS;

/** The cell of an anchor, from the configured site table (`undefined`: none). */
const cellOf = (
  device: RtlsDevice,
  siteAnchors: readonly RtlsAnchor[]
): string | undefined =>
  siteAnchors.find((anchor) => String(anchor.systemId) === String(device.id))
    ?.cell;

/**
 * Grades every initiator's ranging from the responders of its own cell (see
 * {@link InitiatorEvidence}), keyed by the initiator's id. Cells come from
 * the site table; anchors it does not place share the "no cell" group.
 */
export function getInitiatorEvidenceById(
  anchors: readonly RtlsDevice[],
  statsById: Record<string, RtlsDeviceStats | undefined>,
  siteAnchors: readonly RtlsAnchor[]
): Record<string, InitiatorEvidence> {
  const result: Record<string, InitiatorEvidence> = {};
  for (const initiator of anchors) {
    if (classifyRole(initiator.role) !== RtlsRole.ANCHOR_INITIATOR) {
      continue;
    }
    const cell = cellOf(initiator, siteAnchors);
    const responders = anchors.filter(
      (anchor) =>
        classifyRole(anchor.role) === RtlsRole.ANCHOR_RESPONDER &&
        anchor.online &&
        cellOf(anchor, siteAnchors) === cell
    );
    const hearing = responders.some((anchor) => {
      const stats = statsById[anchor.id];
      return !stats?.stale && (stats?.rangingRateHz ?? 0) > 0;
    });
    result[initiator.id] =
      responders.length === 0 ? 'alone' : hearing ? 'hearing' : 'unheard';
  }
  return result;
}

const stateText = (key: string): I18nText => ({
  key: `rtlsAnchor.state.${key}`,
});

/**
 * Standby and asleep look alike (neither ranges, both wake remotely) but
 * differ on what unplugging does, so their chips say it.
 */
const STANDBY: StatusText = {
  status: Status.OFF,
  text: stateText('standby'),
  tooltip: { key: 'rtlsAnchor.stateTooltip.standby' },
};
const ASLEEP: StatusText = {
  status: Status.OFF,
  text: stateText('asleep'),
  tooltip: { key: 'rtlsAnchor.stateTooltip.asleep' },
};

/**
 * The state chip of an anchor: power state first, then whether it ranges.
 * A lost anchor reads "Off" when it was last seen powering down, else
 * "Offline"; `busy` (`isAnchorSwitching`: rebooting into an accepted sleep
 * or wake) overrides both.
 * An operating initiator reads "Ranging" only when a responder hears it
 * (`initiatorEvidence`, given for initiators only).
 */
export function describeAnchorState(
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined,
  busy = false,
  initiatorEvidence?: InitiatorEvidence
): StatusText {
  if (busy) {
    return { status: Status.WAITING, text: stateText('switching') };
  }

  if (isDeviceLost(device)) {
    return wasPoweringDown(stats)
      ? { status: Status.OFF, text: stateText('off') }
      : { status: Status.ERROR, text: stateText('offline') };
  }

  if (stats?.stale) {
    // heartbeats continue but the stats stopped: the cached state is old
    return { status: Status.WARNING, text: stateText('noTelemetry') };
  }

  switch (stats?.powerState) {
    case 'fault':
      return { status: Status.ERROR, text: stateText('fault') };
    case 'booting':
      return { status: Status.WAITING, text: stateText('booting') };
    case 'preview':
    case 'standby':
      return STANDBY;
    case 'asleep':
      return ASLEEP;
    case 'off':
      return { status: Status.OFF, text: stateText('off') };
    case 'stopping':
    case 'shutdown':
      return { status: Status.OFF, text: stateText('stopping') };
    case 'operating':
      if (!isRangingByTelemetry(stats) || initiatorEvidence === 'alone') {
        return { status: Status.WARNING, text: stateText('notRanging') };
      }
      return initiatorEvidence === 'unheard'
        ? { status: Status.WARNING, text: stateText('unheard') }
        : { status: Status.SUCCESS, text: stateText('ranging') };
    default:
      // firmware without the power state: only the heartbeat latch
      return isAnchorResting(stats, device.sleeping)
        ? ASLEEP
        : { status: Status.SUCCESS, text: stateText('online') };
  }
}

/**
 * Whether the ranging figures (rate, A0 distance) describe live ranging:
 * online, with fresh stats, and not resting.
 */
export function showsRangingFigures(
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined
): boolean {
  return (
    !isDeviceLost(device) &&
    !stats?.stale &&
    !isAnchorResting(stats, device.sleeping)
  );
}

/** The warning badges of an anchor row, most severe first. */
export function describeAnchorBadges(
  stats: RtlsDeviceStats | undefined
): AnchorBadge[] {
  if (!stats) {
    return [];
  }

  const badges: AnchorBadge[] = [];
  if (stats.lowBattery) {
    badges.push({
      id: 'lowBattery',
      status: Status.ERROR,
      text: { key: 'rtlsAnchor.badge.lowBattery' },
    });
  }
  if (stats.batteryWarning && !stats.lowBattery) {
    badges.push({
      id: 'batteryWarning',
      status: Status.WARNING,
      text: { key: 'rtlsAnchor.badge.batteryWarning' },
    });
  }
  if (isUwbStartRefused(stats)) {
    badges.push({
      id: 'uwb',
      status: Status.ERROR,
      text: {
        key:
          stats.uwbStatus === RtlsUwbStatus.HARDWARE_FAILURE
            ? 'rtlsAnchor.badge.uwbHardware'
            : 'rtlsAnchor.badge.uwbRefused',
      },
    });
  }
  if (isRangeDeviating(stats)) {
    // non-null: a deviating range check has a reading
    const deviation = stats.rangeDeviationM!;
    badges.push({
      id: 'rangeDeviation',
      status: isRangeDanger(stats) ? Status.ERROR : Status.WARNING,
      text: {
        key:
          deviation < 0
            ? 'rtlsAnchor.badge.rangeCloser'
            : 'rtlsAnchor.badge.rangeFarther',
        values: { cm: Math.round(Math.abs(deviation) * 100) },
      },
      tooltip: { key: 'rtlsAnchor.badgeTooltip.rangeDeviation' },
    });
  }
  if ((stats.radioRestarts ?? 0) > 0) {
    badges.push({
      id: 'radioRestarts',
      status: Status.WARNING,
      text: {
        key: 'rtlsAnchor.badge.radioRestarts',
        values: { count: stats.radioRestarts! }, // non-null: checked above
      },
      tooltip: { key: 'rtlsAnchor.badgeTooltip.radioRestarts' },
    });
  }
  if ((stats.ethernetDrops ?? 0) > 0) {
    badges.push({
      id: 'ethernetDrops',
      status: Status.WARNING,
      text: {
        key: 'rtlsAnchor.badge.ethernetDrops',
        values: { count: stats.ethernetDrops! }, // non-null: checked above
      },
    });
  }
  return badges;
}

const POWER_INPUT_KEYS: Record<RtlsPowerInput, string> = {
  unknown: 'unknown',
  battery: 'battery',
  usb: 'usb',
  'usb-1.5a': 'usb15a',
  'usb-3a': 'usb3a',
  poe: 'poe',
};

/** Label of an anchor's input source. */
export const describePowerInput = (input: RtlsPowerInput): I18nText => ({
  key: `rtlsAnchor.input.${POWER_INPUT_KEYS[input]}`,
});

/** Whether the charger is putting charge into the pack. */
export const isCharging = (charging: RtlsChargingState | undefined): boolean =>
  charging === 'cc' || charging === 'cv' || charging === 'topoff';

/** Label of the charger state. */
export const describeCharging = (charging: RtlsChargingState): I18nText => ({
  key: `rtlsAnchor.charging.${charging}`,
});

const CHARGE_BLOCK_KEYS: Record<RtlsChargeBlock, string> = {
  none: 'none',
  'no-profile': 'noProfile',
  'no-input': 'noInput',
  charger: 'charger',
  gauge: 'gauge',
  temperature: 'temperature',
  'gauge-inhibit': 'gaugeInhibit',
  'pack-voltage': 'packVoltage',
  'charger-fault': 'chargerFault',
  overcurrent: 'overcurrent',
  stopping: 'stopping',
  unknown: 'unknown',
};

/** Label of the reason the anchor does not charge. */
export const describeChargeBlock = (block: RtlsChargeBlock): I18nText => ({
  key: `rtlsAnchor.chargeBlock.${CHARGE_BLOCK_KEYS[block]}`,
});

const UWB_STATUS_KEYS: Record<number, string> = {
  [RtlsUwbStatus.PENDING]: 'pending',
  [RtlsUwbStatus.RUNNING]: 'running',
  [RtlsUwbStatus.DISABLED]: 'disabled',
  [RtlsUwbStatus.INVALID_CONFIG]: 'invalidConfig',
  [RtlsUwbStatus.HARDWARE_FAILURE]: 'hardwareFailure',
};

/** Label of the UWB session start outcome. */
export const describeUwbStatus = (status: number): I18nText => ({
  key: `rtlsAnchor.uwb.${UWB_STATUS_KEYS[status] ?? 'unknown'}`,
});

/** Zephyr hwinfo reset-cause bits, in bit order. */
const RESET_CAUSES = [
  'pin',
  'software',
  'brownout',
  'power-on',
  'watchdog',
  'debug',
  'security',
  'low-power wake',
  'CPU lockup',
  'parity',
  'PLL',
  'clock',
  'hardware',
  'user',
  'temperature',
];

/** Names the bits of a reset-cause mask, e.g. `watchdog, software`. */
export function describeResetCause(mask: number): string {
  if (!Number.isInteger(mask) || mask <= 0) {
    return '—';
  }
  const names = RESET_CAUSES.filter((_, bit) => (mask & (1 << bit)) !== 0);
  return names.length > 0 ? names.join(', ') : `0x${mask.toString(16)}`;
}

/** How long ago a lost device was last heard, coarsened for display. */
export function describeLastSeen(seconds: number | undefined): I18nText {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return { key: 'rtlsAnchor.lastSeen.unknown' };
  }
  if (seconds < 60) {
    return {
      key: 'rtlsAnchor.lastSeen.seconds',
      values: { count: Math.round(seconds) },
    };
  }
  if (seconds < 3600) {
    return {
      key: 'rtlsAnchor.lastSeen.minutes',
      values: { count: Math.round(seconds / 60) },
    };
  }
  return {
    key: 'rtlsAnchor.lastSeen.hours',
    values: { count: Math.round(seconds / 3600) },
  };
}
