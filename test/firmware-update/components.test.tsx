import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import i18next from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';

import { FirmwareRunList } from '~/features/firmware-update/FirmwareRunList';
import FirmwareTargetList from '~/features/firmware-update/FirmwareTargetList';
import FirmwareUpdateConfirmation from '~/features/firmware-update/FirmwareUpdateConfirmation';
import en from '~/i18n/en.json';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.use(initReactI18next).init({
      lng: 'en',
      fallbackLng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
      react: { useSuspense: false },
    });
  }
});

describe('flight firmware confirmation', () => {
  test('shows version, hash, targets and explicit safety conditions', () => {
    const markup = renderToStaticMarkup(
      <FirmwareUpdateConfirmation
        artifact={{
          boardId: 1177,
          boardName: 'AXIOLIGHT-REVB',
          fileName: 'arducopter.apj',
          fileSize: 100,
          firmwareSize: 80,
          gitHash: 'deadbeef',
          sha256: 'a'.repeat(64),
          version: '4.6.3',
        }}
        confirmed={false}
        targets={[
          { id: '7', label: 'Drone 7', compatible: true, safety: {} },
          { id: '8', label: 'Drone 8', compatible: true, safety: {} },
        ]}
        onConfirmed={jest.fn()}
      />
    );

    expect(markup).toContain('4.6.3');
    expect(markup).toContain('deadbeef');
    expect(markup).toContain('Drone 7, Drone 8');
    expect(markup).toContain('disarmed');
    expect(markup).toContain('stable, sufficient power');
    expect(markup).toContain('never retried automatically');
  });

  test('exposes a terminal success row and installed hash', () => {
    const markup = renderToStaticMarkup(
      <FirmwareRunList
        runs={[
          {
            id: '7',
            operationId: 'operation-1',
            phase: 'complete',
            status: 'success',
            committed: true,
            cancellable: false,
            observedHash: 'deadbeef',
          },
        ]}
      />
    );
    expect(markup).toContain('flight-firmware-update.result-7-success');
    expect(markup).toContain('Installed and verified');
  });
});

describe('flight firmware target selection', () => {
  test('renders loading, failure, and empty target states', () => {
    const render = (
      props: Partial<React.ComponentProps<typeof FirmwareTargetList>>
    ) =>
      renderToStaticMarkup(
        <FirmwareTargetList
          loading={false}
          onSelected={jest.fn()}
          selectedIds={[]}
          targets={[]}
          {...props}
        />
      );

    expect(render({ loading: true })).toContain(
      'Loading compatible drones and safety state'
    );
    expect(render({ error: 'server unavailable' })).toContain(
      'server unavailable'
    );
    expect(render({})).toContain(
      'Axio Server reported no flight controllers available'
    );
  });

  test('renders selected, incompatible, and safety states with stable selectors', () => {
    const markup = renderToStaticMarkup(
      <FirmwareTargetList
        loading={false}
        onSelected={jest.fn()}
        selectedIds={['7']}
        targets={[
          {
            id: '7',
            label: 'Drone 7',
            compatible: true,
            currentVersion: '4.6.2',
            currentHash: 'abc123',
            safety: {
              connected: true,
              disarmed: false,
              onGround: undefined,
              powerSufficient: true,
            },
          },
          {
            id: '8',
            compatible: false,
            error: { code: 'wrong_board', detail: 'board 9' },
            safety: {},
          },
          {
            id: '9',
            compatible: false,
            error: { code: 'offline' },
            safety: {},
          },
        ]}
      />
    );

    expect(markup).toContain('flight-firmware-update.target-7.select');
    expect(markup).toContain('Drone 7');
    expect(markup).toContain('4.6.2');
    expect(markup).toContain('abc123');
    expect(markup).toContain('board 9');
    expect(markup).toContain('Not compatible with flight-controller OTA');
  });
});
