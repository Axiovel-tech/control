import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  jest,
  test,
} from '@jest/globals';

const mockSendMessage =
  jest.fn<
    (
      request: Record<string, unknown>
    ) => Promise<{ body: Record<string, unknown> }>
  >();
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    sendMessage: (request: Record<string, unknown>) => mockSendMessage(request),
  },
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { configureStore } from '@reduxjs/toolkit';
import i18next from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';

import {
  prepareFirmwareArtifact,
  runFirmwareUpdateSequence,
} from '~/features/firmware-update/actions';
import FirmwareTargetList from '~/features/firmware-update/FirmwareTargetList';
import FirmwareUpdateConfirmation from '~/features/firmware-update/FirmwareUpdateConfirmation';
import {
  queryFirmwareUpdateTargets,
  startFirmwareUpdate,
} from '~/features/firmware-update/messages';
import {
  canStartFirmwareUpdate,
  getLowBatteryTargetIds,
} from '~/features/firmware-update/selectors';
import reducer, {
  firmwareTargetsLoaded,
  firmwareTargetsLoading,
  setFirmwareTargetSelected,
  setFirmwareUpdateConfirmed,
  setFirmwareUpdateLowBatteryAccepted,
} from '~/features/firmware-update/slice';
import type {
  FirmwareUpdateTarget,
  PreparedFirmwareArtifact,
} from '~/features/firmware-update/types';
import en from '~/i18n/en.json';
import type { AppDispatch, RootState } from '~/store/reducers';

type Hub = Parameters<typeof queryFirmwareUpdateTargets>[0];

const ARTIFACT: PreparedFirmwareArtifact = {
  image: 'YXJkdXBpbG90',
  metadata: {
    boardId: 1177,
    boardName: 'AXIOLIGHT-REVB',
    fileName: 'arducopter.apj',
    fileSize: 12,
    firmwareSize: 3,
    gitHash: 'deadbeef',
    sha256: 'a'.repeat(64),
    version: '4.6.3',
  },
};

const HEALTHY: FirmwareUpdateTarget = {
  id: '7',
  label: 'Drone 7',
  compatible: true,
  safety: { powerSufficient: true, batteryVoltage: 8.1 },
};

const LOW: FirmwareUpdateTarget = {
  id: '18',
  label: 'Drone 18',
  compatible: true,
  safety: {
    powerSufficient: false,
    batteryVoltage: 7.228,
    minimumBatteryVoltage: 7.3,
  },
  warning: { code: 'batteryLow', detail: 'low' },
};

const job = (id: string): { body: Record<string, unknown> } => ({
  body: {
    type: 'X-AP-OTA',
    op: 'start',
    job: {
      id,
      operationId: `operation-${id}`,
      phase: 'complete',
      status: 'success',
      committed: true,
      cancellable: false,
    },
  },
});

const prepareStore = (targets: FirmwareUpdateTarget[]) => {
  const store = configureStore({ reducer: { firmwareUpdate: reducer } });
  const dispatch = store.dispatch as AppDispatch;
  dispatch(firmwareTargetsLoaded({ generation: 0, targets }));
  for (const target of targets) {
    dispatch(setFirmwareTargetSelected({ id: target.id, selected: true }));
  }

  dispatch(prepareFirmwareArtifact(ARTIFACT));
  dispatch(setFirmwareUpdateConfirmed(true));
  const canStart = () =>
    canStartFirmwareUpdate(store.getState() as unknown as RootState);
  return { store, dispatch, canStart };
};

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

beforeEach(() => {
  mockSendMessage.mockReset();
});

describe('low battery warning from the server', () => {
  test('parses the warning and the measured voltages', async () => {
    const sendMessage = jest.fn(() =>
      Promise.resolve({
        body: {
          type: 'X-AP-OTA',
          op: 'targets',
          targets: [
            {
              id: '18',
              compatible: true,
              error: null,
              warning: { code: 'batteryLow', detail: 'low' },
              safety: {
                powerSufficient: false,
                batteryVoltage: 7.228,
                minimumBatteryVoltage: 7.3,
              },
            },
            {
              id: '7',
              compatible: true,
              warning: null,
              safety: { batteryVoltage: '8.1', minimumBatteryVoltage: null },
            },
          ],
        },
      })
    );
    const targets = await queryFirmwareUpdateTargets({
      sendMessage,
    } as unknown as Hub);

    expect(targets[0]).toMatchObject({
      error: undefined,
      warning: { code: 'batteryLow', detail: 'low' },
      safety: {
        powerSufficient: false,
        batteryVoltage: 7.228,
        minimumBatteryVoltage: 7.3,
      },
    });
    expect(targets[1].warning).toBeUndefined();
    expect(targets[1].safety.batteryVoltage).toBeUndefined();
    expect(targets[1].safety.minimumBatteryVoltage).toBeUndefined();
  });

  test('asks the server to allow a low battery only when told to', async () => {
    const sendMessage = jest.fn(() => Promise.resolve(job('18')));
    const hub = { sendMessage } as unknown as Hub;

    await startFirmwareUpdate(hub, '18', ARTIFACT, { allowLowBattery: true });
    await startFirmwareUpdate(hub, '18', ARTIFACT, { allowLowBattery: false });
    await startFirmwareUpdate(hub, '18', ARTIFACT);

    const requests = sendMessage.mock.calls.map(
      (call) => (call as unknown[])[0] as Record<string, unknown>
    );
    expect(requests[0]).toMatchObject({ op: 'start', allowLowBattery: true });
    expect(requests[1]).not.toHaveProperty('allowLowBattery');
    expect(requests[2]).not.toHaveProperty('allowLowBattery');
  });
});

describe('low battery acceptance', () => {
  test('is needed only for selected targets that carry the warning', () => {
    const state = { selectedIds: ['7'], targets: [HEALTHY, LOW] };
    expect(getLowBatteryTargetIds(state)).toEqual([]);
    expect(
      getLowBatteryTargetIds({ ...state, selectedIds: ['7', '18'] })
    ).toEqual(['18']);
  });

  test('blocks the start until the operator accepts it', () => {
    const { dispatch, canStart } = prepareStore([HEALTHY, LOW]);
    expect(canStart()).toBe(false);

    dispatch(setFirmwareUpdateLowBatteryAccepted(true));
    expect(canStart()).toBe(true);

    dispatch(setFirmwareUpdateLowBatteryAccepted(false));
    expect(canStart()).toBe(false);
  });

  test('is not asked for when no selected target is low', () => {
    const { canStart } = prepareStore([HEALTHY]);
    expect(canStart()).toBe(true);
  });

  test('is withdrawn when the selection or the target facts change', () => {
    const { store, dispatch } = prepareStore([HEALTHY, LOW]);
    const accepted = () => store.getState().firmwareUpdate.lowBatteryAccepted;

    dispatch(setFirmwareUpdateLowBatteryAccepted(true));
    dispatch(setFirmwareTargetSelected({ id: '7', selected: false }));
    expect(accepted()).toBe(false);

    dispatch(setFirmwareUpdateLowBatteryAccepted(true));
    dispatch(firmwareTargetsLoading(1));
    expect(accepted()).toBe(false);
    dispatch(setFirmwareUpdateLowBatteryAccepted(true));
    expect(accepted()).toBe(false);

    dispatch(firmwareTargetsLoaded({ generation: 1, targets: [HEALTHY, LOW] }));
    dispatch(setFirmwareUpdateLowBatteryAccepted(true));
    expect(accepted()).toBe(true);
    dispatch(prepareFirmwareArtifact(ARTIFACT));
    expect(accepted()).toBe(false);
  });

  test('does not start a sequence without it', async () => {
    const { store, dispatch } = prepareStore([HEALTHY, LOW]);

    await dispatch(runFirmwareUpdateSequence());

    expect(mockSendMessage).not.toHaveBeenCalled();
    expect(store.getState().firmwareUpdate.running).toBe(false);
  });

  test('is sent to the server only for the targets that were low', async () => {
    mockSendMessage.mockImplementation((request) =>
      Promise.resolve(job(String(request['id'])))
    );
    const { dispatch } = prepareStore([HEALTHY, LOW]);
    dispatch(setFirmwareUpdateLowBatteryAccepted(true));

    await dispatch(runFirmwareUpdateSequence());

    const starts = mockSendMessage.mock.calls
      .map(([request]) => request)
      .filter((request) => request['op'] === 'start');
    expect(starts.map((request) => request['id'])).toEqual(['7', '18']);
    expect(starts[0]).not.toHaveProperty('allowLowBattery');
    expect(starts[1]).toMatchObject({ allowLowBattery: true });
  });
});

describe('low battery warning in the dialog', () => {
  const confirmation = (targets: FirmwareUpdateTarget[]) =>
    renderToStaticMarkup(
      <FirmwareUpdateConfirmation
        artifact={ARTIFACT.metadata}
        confirmed={false}
        lowBatteryAccepted={false}
        targets={targets}
        onConfirmed={jest.fn()}
        onLowBatteryAccepted={jest.fn()}
      />
    );

  test('states the battery level and offers to continue', () => {
    const markup = confirmation([HEALTHY, LOW]);
    expect(markup).toContain('flight-firmware-update.low-battery');
    expect(markup).toContain('Drone 18: 7.23 V (minimum 7.30 V)');
    expect(markup).not.toContain('Drone 7: ');
    expect(markup).toContain('flight-firmware-update.accept-low-battery');
    expect(markup).toContain('Continue with low battery');
  });

  test('is absent when every selected battery is fine', () => {
    const markup = confirmation([HEALTHY]);
    expect(markup).not.toContain('flight-firmware-update.low-battery');
    expect(markup).not.toContain('flight-firmware-update.accept-low-battery');
  });

  test('falls back when the server does not report the voltages', () => {
    const markup = confirmation([{ ...LOW, safety: {} }]);
    expect(markup).toContain('Drone 18: unknown V (minimum unknown V)');
  });

  test('shows the battery level in the target list', () => {
    const markup = renderToStaticMarkup(
      <FirmwareTargetList
        loading={false}
        selectedIds={[]}
        targets={[HEALTHY, LOW]}
        onSelected={jest.fn()}
      />
    );
    expect(markup).toContain('Battery low: 7.23 V (minimum 7.30 V)');
    expect(markup.match(/Battery low/g)).toHaveLength(1);
  });
});
