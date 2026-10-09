import { describe, expect, jest, test } from '@jest/globals';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// The device list view pulls in the sleep actions, whose `~/message-hub` and
// snackbar/error-handling imports sit on heavy import chains (the entire
// application store); they are stubbed with thin mocks, same approach as in
// sleep-actions.test.ts.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));
// No i18next instance is initialized under jest (see the `~/i18n` stub):
// translation lookups echo the key.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string): string => key }),
}));

import { Status } from '~/components/semantics';
import { type RtlsDevice } from '~/features/rtls/types';
import {
  describeDeviceWithPairedUav,
  describeFlightController,
} from '~/views/rtls/DeviceStatsRow';

const render = (node: React.ReactNode): string =>
  renderToStaticMarkup(<>{node}</>);

describe('RTLS device row primary line', () => {
  const tag: RtlsDevice = { id: '199', name: 'RTLS tag 199', online: true };

  test('renders just the display name without a pairing', () => {
    const markup = render(describeDeviceWithPairedUav(tag, undefined));
    expect(markup).toContain('RTLS tag 199');
    expect(markup).not.toContain('drone');
  });

  test('renders the paired drone as a pill in the UAV status color', () => {
    const markup = render(
      describeDeviceWithPairedUav({ ...tag, uav: '05' }, Status.SUCCESS)
    );
    expect(markup).toContain('RTLS tag 199');
    expect(markup).toContain('drone 05');
    expect(markup).toContain('StatusPill-status-success');
  });

  test('falls back to the "off" pill color for an unknown UAV', () => {
    const markup = render(
      describeDeviceWithPairedUav({ ...tag, uav: '07' }, undefined)
    );
    expect(markup).toContain('drone 07');
    expect(markup).toContain('StatusPill-status-off');
  });

  test('prefers the paired drone over the flight controller the tag reports', () => {
    const markup = render(
      describeDeviceWithPairedUav(
        {
          ...tag,
          uav: '05',
          flightController: { state: 'live', systemId: 5 },
        },
        Status.SUCCESS
      )
    );
    expect(markup).toContain('drone 05');
    expect(markup).not.toContain('rtlsFlightController');
  });

  test('keeps an ambiguous claim visible next to the paired drone', () => {
    const markup = render(
      describeDeviceWithPairedUav(
        {
          ...tag,
          uav: '08',
          flightController: { state: 'ambiguous', systemId: 8 },
        },
        Status.SUCCESS
      )
    );
    expect(markup).toContain('drone 08');
    expect(markup).toContain('rtlsFlightController.pill.ambiguous');
    expect(markup).toContain('StatusPill-status-warning');
  });

  test('renders the flight controller of an unpaired tag as a pill', () => {
    const markup = render(
      describeDeviceWithPairedUav(
        { ...tag, flightController: { state: 'remembered', systemId: 8 } },
        undefined
      )
    );
    expect(markup).toContain('RTLS tag 199');
    expect(markup).toContain('rtlsFlightController.pill.known');
    expect(markup).toContain('StatusPill-status-off');
  });
});

describe('RTLS flight-controller pill', () => {
  test('a remembered id is grey: the flight controller is not connected', () => {
    expect(
      describeFlightController({ state: 'remembered', systemId: 8 })
    ).toEqual({
      status: Status.OFF,
      label: { key: 'rtlsFlightController.pill.known', values: { id: 8 } },
      tooltip: {
        key: 'rtlsFlightController.tooltip.remembered',
        values: { id: 8 },
      },
    });
  });

  test('a live id the server has not paired is info', () => {
    expect(describeFlightController({ state: 'live', systemId: 8 })).toEqual({
      status: Status.INFO,
      label: { key: 'rtlsFlightController.pill.known', values: { id: 8 } },
      tooltip: { key: 'rtlsFlightController.tooltip.live', values: { id: 8 } },
    });
  });

  test('an ambiguous claim warns and carries the server reason', () => {
    expect(
      describeFlightController({
        state: 'ambiguous',
        systemId: 8,
        reason: 'tag 9 claims it too',
      })
    ).toEqual({
      status: Status.WARNING,
      label: { key: 'rtlsFlightController.pill.ambiguous', values: { id: 8 } },
      tooltip: { key: 'rtlsFlightController.tooltip.ambiguous' },
      reason: 'tag 9 claims it too',
    });
  });

  test('an ambiguous claim without a system id shows no id', () => {
    expect(describeFlightController({ state: 'ambiguous' })).toMatchObject({
      status: Status.WARNING,
      label: { key: 'rtlsFlightController.pill.ambiguousNoId' },
      reason: undefined,
    });
  });
});
