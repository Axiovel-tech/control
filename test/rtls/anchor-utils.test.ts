import { describe, expect, test } from '@jest/globals';

import { Status } from '~/components/semantics';
import {
  describeAnchorBadges,
  describeAnchorState,
  describeLastSeen,
  describeResetCause,
  findInitiatorPeer,
  formatInitiatorDistance,
  getAnchorSlot,
  getInitiatorEvidence,
  getInitiatorMacs,
  showsRangingFigures,
} from '~/features/rtls/anchor-utils';
import {
  getDeviceSpecies,
  inferImageSpecies,
  resolveImageSpecies,
} from '~/features/rtls/ota-species';
import {
  type RtlsAnchor,
  type RtlsDevice,
  type RtlsDeviceStats,
} from '~/features/rtls/types';

const device = (extra: Partial<RtlsDevice> = {}): RtlsDevice => ({
  id: '103',
  online: true,
  role: 'anchor-responder',
  ...extra,
});

const stats = (extra: Partial<RtlsDeviceStats> = {}): RtlsDeviceStats => ({
  id: '103',
  ...extra,
});

const siteAnchors: RtlsAnchor[] = [
  { id: 'rtls::default::anchor_0', cell: 'default', index: 0, mac: 0x10 },
  {
    id: 'rtls::default::anchor_3',
    cell: 'default',
    index: 3,
    mac: 0x13,
    systemId: 103,
  },
];

describe('getAnchorSlot', () => {
  test('takes the slot from the configured anchor table first', () => {
    expect(getAnchorSlot(device({ name: 'RTLS anchor A5' }), siteAnchors)).toBe(
      3
    );
  });

  test("falls back to the server's anchor name", () => {
    expect(getAnchorSlot(device({ name: 'RTLS anchor A5' }), [])).toBe(5);
  });

  test('an initiator is A0, an unnamed responder unknown', () => {
    expect(getAnchorSlot(device({ role: 'anchor-initiator' }), [])).toBe(0);
    expect(getAnchorSlot(device({ name: 'RTLS anchor 103' }), [])).toBe(
      undefined
    );
  });
});

describe('A0 distance of a responder', () => {
  const macs = getInitiatorMacs(siteAnchors);

  test('picks the row towards the initiator', () => {
    const peer = findInitiatorPeer(
      [
        { peerMac: 0x11, distanceM: 3 },
        { peerMac: 0x10, distanceM: 14.1, madM: 0.023 },
      ],
      macs
    );
    expect(formatInitiatorDistance(peer)).toBe('14.10 m ±2 cm');
  });

  test('uses the only row when the initiator MAC is not configured', () => {
    expect(
      formatInitiatorDistance(
        findInitiatorPeer([{ peerMac: 0x20, distanceM: 9.5 }], new Set())
      )
    ).toBe('9.50 m');
  });

  test('a dash without a usable row', () => {
    expect(formatInitiatorDistance(findInitiatorPeer(undefined, macs))).toBe(
      '—'
    );
    expect(
      formatInitiatorDistance(
        findInitiatorPeer(
          [
            { peerMac: 0x21, distanceM: 1 },
            { peerMac: 0x22, distanceM: 2 },
          ],
          macs
        )
      )
    ).toBe('—');
  });
});

describe('describeAnchorState', () => {
  const chip = (
    deviceExtra: Partial<RtlsDevice>,
    statsExtra: Partial<RtlsDeviceStats> | undefined,
    busy = false
  ) => {
    const { status, text } = describeAnchorState(
      device(deviceExtra),
      statsExtra && stats(statsExtra),
      busy
    );
    return [status, text.key.replace('rtlsAnchor.state.', '')];
  };

  test('reads the power state', () => {
    expect(chip({}, { powerState: 'operating', rangingRateHz: 9 })).toEqual([
      Status.SUCCESS,
      'ranging',
    ]);
    expect(chip({}, { powerState: 'asleep' })).toEqual([Status.OFF, 'asleep']);
    expect(chip({}, { powerState: 'standby' })).toEqual([
      Status.OFF,
      'standby',
    ]);
    expect(chip({}, { powerState: 'booting' })).toEqual([
      Status.WAITING,
      'booting',
    ]);
    expect(chip({}, { powerState: 'fault' })).toEqual([Status.ERROR, 'fault']);
  });

  test('standby and asleep explain how they differ', () => {
    expect(
      describeAnchorState(device(), stats({ powerState: 'standby' })).tooltip
    ).toEqual({ key: 'rtlsAnchor.stateTooltip.standby' });
    expect(
      describeAnchorState(device(), stats({ powerState: 'asleep' })).tooltip
    ).toEqual({ key: 'rtlsAnchor.stateTooltip.asleep' });
  });

  test('an operating anchor that does not range says so', () => {
    expect(chip({}, { powerState: 'operating', uwbStatus: 3 })).toEqual([
      Status.WARNING,
      'notRanging',
    ]);
    expect(chip({}, { powerState: 'operating', rangingRateHz: 0 })).toEqual([
      Status.WARNING,
      'notRanging',
    ]);
  });

  test('a lost anchor is offline, or off when it was powering down', () => {
    expect(chip({ online: false }, { powerState: 'operating' })).toEqual([
      Status.ERROR,
      'offline',
    ]);
    expect(chip({ online: false }, { powerState: 'off' })).toEqual([
      Status.OFF,
      'off',
    ]);
    expect(chip({}, { powerState: 'operating', stale: true })).toEqual([
      Status.ERROR,
      'offline',
    ]);
  });

  test('a sleep/wake in flight overrides the reboot gap', () => {
    expect(chip({ online: false }, undefined, true)).toEqual([
      Status.WAITING,
      'switching',
    ]);
  });

  test('older firmware without a power state falls back to the latch', () => {
    expect(chip({ sleeping: true }, {})).toEqual([Status.OFF, 'asleep']);
    expect(chip({}, undefined)).toEqual([Status.SUCCESS, 'online']);
  });

  test('ranging figures only while the anchor ranges or may range', () => {
    expect(
      showsRangingFigures(device(), stats({ powerState: 'operating' }))
    ).toBe(true);
    expect(showsRangingFigures(device(), stats({ powerState: 'asleep' }))).toBe(
      false
    );
    expect(showsRangingFigures(device({ online: false }), undefined)).toBe(
      false
    );
  });
});

describe('describeAnchorBadges', () => {
  test('none for a clean anchor', () => {
    expect(
      describeAnchorBadges(stats({ powerState: 'operating', uwbStatus: 1 }))
    ).toEqual([]);
  });

  test('most severe first', () => {
    const badges = describeAnchorBadges(
      stats({
        moved: true,
        lowBattery: true,
        uwbStatus: 3,
        radioRestarts: 2,
        ethernetDrops: 1,
      })
    );
    expect(badges.map(({ id, status }) => [id, status])).toEqual([
      ['lowBattery', Status.ERROR],
      ['uwb', Status.ERROR],
      ['moved', Status.WARNING],
      ['radioRestarts', Status.WARNING],
      ['ethernetDrops', Status.WARNING],
    ]);
    expect(badges[3].text.values).toEqual({ count: 2 });
  });

  test('radio restarts say what they count', () => {
    expect(
      describeAnchorBadges(stats({ radioRestarts: 1 }))[0].tooltip?.key
    ).toBe('rtlsAnchor.badgeTooltip.radioRestarts');
  });

  test('names a UWB hardware failure apart from a refused configuration', () => {
    expect(describeAnchorBadges(stats({ uwbStatus: 4 }))[0].text.key).toBe(
      'rtlsAnchor.badge.uwbHardware'
    );
  });
});

describe('detail formatting', () => {
  test('names the reset-cause bits', () => {
    expect(describeResetCause(0x12)).toBe('software, watchdog');
    expect(describeResetCause(0)).toBe('—');
    expect(describeResetCause(0x10000)).toBe('0x10000');
  });

  test('coarsens the last-seen age', () => {
    expect(describeLastSeen(12.4)).toEqual({
      key: 'rtlsAnchor.lastSeen.seconds',
      values: { count: 12 },
    });
    expect(describeLastSeen(150).values).toEqual({ count: 3 });
    expect(describeLastSeen(7300).key).toBe('rtlsAnchor.lastSeen.hours');
    expect(describeLastSeen(undefined).key).toBe('rtlsAnchor.lastSeen.unknown');
  });
});

describe('OTA image species', () => {
  test('infers the species from the build path', () => {
    expect(
      inferImageSpecies('build/axio_anchor/anchor/anchor/zephyr/x.signed.bin')
    ).toBe('anchor');
    expect(
      inferImageSpecies('build/axiolight-tag/tag/zephyr/zephyr.signed.bin')
    ).toBe('tag');
    expect(inferImageSpecies('/tmp/anchor.signed.bin')).toBe('anchor');
  });

  test('leaves it to the operator when the path names neither or both', () => {
    expect(inferImageSpecies('fw/zephyr.signed.bin')).toBe(undefined);
    expect(inferImageSpecies('tag/anchor.bin')).toBe(undefined);
    expect(inferImageSpecies('build/stagger/zephyr.bin')).toBe(undefined);
  });

  test('the build receipt locks the species', () => {
    expect(
      resolveImageSpecies('build/x/anchor/zephyr.signed.bin', 'anchor', 'tag')
    ).toEqual({ species: 'tag', locked: true, source: 'receipt' });
  });

  test('without a receipt the operator chooses, the path suggests', () => {
    expect(resolveImageSpecies('build/sr250-anchor/anchor/z.bin', '')).toEqual({
      species: 'anchor',
      locked: false,
      source: 'path',
    });
    expect(
      resolveImageSpecies('build/sr250-anchor/anchor/z.bin', 'tag')
    ).toEqual({ species: 'tag', locked: false, source: 'operator' });
    expect(resolveImageSpecies('fw/zephyr.signed.bin', '')).toEqual({
      species: '',
      locked: false,
      source: 'none',
    });
  });

  test('derives the device species from its role', () => {
    expect(getDeviceSpecies('anchor-initiator')).toBe('anchor');
    expect(getDeviceSpecies('anchor-responder')).toBe('anchor');
    expect(getDeviceSpecies('tag')).toBe('tag');
    expect(getDeviceSpecies(undefined)).toBe(undefined);
  });
});

describe('initiator ranging evidence', () => {
  const a0 = device({ id: '101', role: 'anchor-initiator' });
  const responder = (id: string, extra: Partial<RtlsDevice> = {}) =>
    device({ id, ...extra });
  const operating = stats({ powerState: 'operating', rangingRateHz: 50 });

  test('A0 ranges when an online responder hears it', () => {
    const evidence = getInitiatorEvidence(
      [a0, responder('102'), responder('103')],
      {
        '102': stats({ powerState: 'asleep', rangingRateHz: 0 }),
        '103': stats({ powerState: 'operating', rangingRateHz: 9.8 }),
      }
    );
    expect(evidence).toBe('hearing');
    expect(describeAnchorState(a0, operating, false, evidence)).toEqual({
      status: Status.SUCCESS,
      text: { key: 'rtlsAnchor.state.ranging' },
    });
  });

  test('every responder asleep: A0 is not heard, whatever its own rate', () => {
    const evidence = getInitiatorEvidence(
      [a0, responder('102'), responder('103')],
      {
        '102': stats({ powerState: 'asleep' }),
        '103': stats({ powerState: 'asleep', rangingRateHz: 0 }),
      }
    );
    expect(evidence).toBe('unheard');
    expect(describeAnchorState(a0, operating, false, evidence)).toEqual({
      status: Status.WARNING,
      text: { key: 'rtlsAnchor.state.unheard' },
    });
  });

  test('A0 alone (responders lost or absent) is not ranging', () => {
    const evidence = getInitiatorEvidence(
      [a0, responder('102', { online: false })],
      { '102': stats({ powerState: 'operating', rangingRateHz: 9 }) }
    );
    expect(evidence).toBe('alone');
    expect(getInitiatorEvidence([a0], {})).toBe('alone');
    expect(describeAnchorState(a0, operating, false, evidence).text.key).toBe(
      'rtlsAnchor.state.notRanging'
    );
  });

  test('a stale responder snapshot is no evidence', () => {
    expect(
      getInitiatorEvidence([a0, responder('102')], {
        '102': stats({ rangingRateHz: 9, stale: true }),
      })
    ).toBe('alone');
  });
});
