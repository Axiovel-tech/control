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

import { Status } from '~/components/semantics';
import { type RtlsDevice } from '~/features/rtls/types';
import { describeDeviceWithPairedUav } from '~/views/rtls/DeviceStatsRow';

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
});
