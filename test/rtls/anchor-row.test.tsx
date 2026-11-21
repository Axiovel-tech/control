import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

// No i18next instance is initialized under jest (see the `~/i18n` stub):
// translation lookups echo the key, followed by their values so the test can
// see what was interpolated.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>): string =>
      values === undefined
        ? key
        : `${key}(${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`,
  }),
}));

import { Status } from '~/components/semantics';
import { type RtlsDevice, type RtlsDeviceStats } from '~/features/rtls/types';
import DeviceStatsRow, { getRowStatus } from '~/views/rtls/DeviceStatsRow';

const handlers = {
  onForget: jest.fn(),
  onShowOta: jest.fn(),
  onShowParameters: jest.fn(),
  onSleep: jest.fn(),
  onWake: jest.fn(),
};

const responder: RtlsDevice = {
  id: '103',
  name: 'RTLS anchor A3',
  online: true,
  role: 'anchor-responder',
  firmwareVersion: '1.4.0',
  twr: [{ peerMac: 0x10, distanceM: 14.1, ageMs: 200, madM: 0.02 }],
};

const ranging: RtlsDeviceStats = {
  id: '103',
  powerState: 'operating',
  uwbStatus: 1,
  rangingRateHz: 9.8,
  batteryPercent: 81,
  batteryVoltage: 3.92,
  powerInput: 'poe',
  charging: 'cc',
  moved: true,
  radioRestarts: 2,
  bootCount: 4,
  resetCause: 0x10,
};

const render = (
  props: Partial<React.ComponentProps<typeof DeviceStatsRow>> = {}
): string =>
  renderToStaticMarkup(
    <DeviceStatsRow
      anchorSlot={3}
      device={responder}
      handlers={handlers}
      initiatorMacs={new Set([0x10])}
      stats={ranging}
      onToggleExpanded={jest.fn()}
      {...props}
    />
  );

describe('anchor row header', () => {
  const markup = render();

  test('shows the slot badge and the state chip', () => {
    expect(markup).toContain('rtlsAnchor.role.slot(slot=3)');
    expect(markup).toContain('rtlsAnchor.state.ranging');
  });

  test('shows the ranging rate and the A0 distance with its spread', () => {
    expect(markup).toContain('9.8 Hz');
    expect(markup).toContain('14.10 m ±2 cm');
  });

  test('shows the battery percent, the input source and the warnings', () => {
    expect(markup).toContain('81%');
    expect(markup).toContain('data-testid="rtls-anchor-input-poe"');
    expect(markup).toContain('data-testid="rtls-anchor-badge-moved"');
    expect(markup).toContain('rtlsAnchor.badge.radioRestarts(count=2)');
  });

  test('offers sleep and wake on anchors too', () => {
    expect(markup).not.toContain('data-testid="rtls-device-forget"');
    expect(markup).toContain('data-testid="rtls-device-sleep"');
    expect(markup).toContain('data-testid="rtls-device-wake"');
  });

  test('keeps the details behind "show more"', () => {
    expect(markup).toContain('rtlsTagDetails.showMore');
    expect(markup).not.toContain('rtlsAnchor.detail.boots');
    expect(markup).not.toContain('rtlsAnchor.detail.peer(mac=0x0010)');
  });

  test('a voltage-only battery shows volts', () => {
    expect(
      render({
        stats: { ...ranging, batteryPercent: undefined },
      })
    ).toContain('3.9V');
  });
});

describe('anchor row details', () => {
  const markup = render({ expanded: true });

  test('hold the boots, reset cause, charging and peers', () => {
    expect(markup).toContain('rtlsAnchor.detail.boots');
    expect(markup).toContain('boots=4');
    expect(markup).toContain('watchdog');
    expect(markup).toContain('rtlsAnchor.charging.cc');
    expect(markup).toContain('rtlsAnchor.detail.peer(mac=0x0010)');
    expect(markup).toContain('14.10 m ±2 cm · 200 ms');
    expect(markup).toContain('fw 1.4.0');
  });
});

describe('a lost anchor', () => {
  const lost: RtlsDevice = {
    ...responder,
    online: false,
    lastSeenAgeS: 125,
  };
  const markup = render({ device: lost, stats: { ...ranging, stale: true } });

  test('stays listed, greyed, with when it was last heard', () => {
    expect(markup).toContain('rtlsAnchor.state.offline');
    expect(markup).toContain('rtlsAnchor.lastSeen.minutes(count=2)');
    expect(markup).toContain('opacity:0.55');
  });

  test('shows no live ranging figures', () => {
    expect(markup).not.toContain('9.8 Hz');
    expect(markup).not.toContain('14.10 m');
  });

  test('offers forget instead of sleep/wake', () => {
    expect(markup).toContain('data-testid="rtls-device-forget"');
    expect(markup).not.toContain('data-testid="rtls-device-sleep"');
  });

  test('is red', () => {
    expect(getRowStatus(lost, ranging)).toBe(Status.ERROR);
  });
});

describe('a standby anchor', () => {
  test('offers sleep (it moves into real sleep in place)', () => {
    const markup = render({
      stats: { id: '103', powerState: 'standby', powerInput: 'usb' },
    });
    expect(markup).toContain('rtlsAnchor.state.standby');
    expect(markup).toContain('data-testid="rtls-device-sleep"');
  });
});

describe('anchor row status light', () => {
  test('an asleep anchor is grey, not red', () => {
    expect(getRowStatus(responder, { id: '103', powerState: 'asleep' })).toBe(
      Status.OFF
    );
  });

  test('a ranging anchor with a warning is yellow', () => {
    expect(getRowStatus(responder, ranging)).toBe(Status.WARNING);
  });

  test('a clean ranging anchor is green', () => {
    expect(
      getRowStatus(responder, {
        id: '103',
        powerState: 'operating',
        uwbStatus: 1,
        rangingRateHz: 9.8,
      })
    ).toBe(Status.SUCCESS);
  });
});

describe('an initiator no responder hears', () => {
  const a0: RtlsDevice = {
    id: '101',
    name: 'RTLS anchor A0',
    online: true,
    role: 'anchor-initiator',
  };
  const a0Stats: RtlsDeviceStats = {
    id: '101',
    powerState: 'operating',
    uwbStatus: 1,
    rangingRateHz: 50,
  };

  test('says so instead of "Ranging"', () => {
    const markup = render({
      anchorSlot: 0,
      device: a0,
      stats: a0Stats,
      initiatorEvidence: 'unheard',
    });
    expect(markup).toContain('rtlsAnchor.state.unheard');
    expect(markup).not.toContain('rtlsAnchor.state.ranging');
    expect(markup).toContain('StatusLight-status-warning');
  });

  test('reads "Ranging" while a responder hears it', () => {
    const markup = render({
      anchorSlot: 0,
      device: a0,
      stats: a0Stats,
      initiatorEvidence: 'hearing',
    });
    expect(markup).toContain('rtlsAnchor.state.ranging');
    expect(markup).toContain('StatusLight-status-success');
  });
});

describe('tag rows are unchanged', () => {
  test('a tag still shows its solve figures and no anchor parts', () => {
    const markup = render({
      device: { id: '7', online: true, role: 'tag', sleeping: false },
      stats: { id: '7', solveRateHz: 10, solvePct: 95 },
      anchorSlot: undefined,
    });
    expect(markup).toContain('Solve rate');
    expect(markup).not.toContain('rtls-anchor-state');
  });
});

describe('a device whose role has not arrived', () => {
  test('offers no sleep or wake (it may be an anchor)', () => {
    const markup = render({
      device: { id: '9', online: true },
      stats: undefined,
    });
    expect(markup).not.toContain('data-testid="rtls-device-sleep"');
    expect(markup).not.toContain('data-testid="rtls-device-wake"');
  });
});

describe('a lost tag', () => {
  test('is greyed with when it was last heard', () => {
    const markup = render({
      device: {
        id: '7',
        online: false,
        role: 'tag',
        sleeping: false,
        lastSeenAgeS: 42,
      },
      stats: { id: '7', solveRateHz: 10 },
    });
    expect(markup).toContain('opacity:0.55');
    expect(markup).toContain('rtlsAnchor.lastSeen.seconds(count=42)');
  });
});

describe('a responder that measures nothing', () => {
  test('shows no A0 distance', () => {
    const markup = render({
      stats: { ...ranging, rangingRateHz: 0 },
    });
    expect(markup).not.toContain('14.10 m');
  });
});
