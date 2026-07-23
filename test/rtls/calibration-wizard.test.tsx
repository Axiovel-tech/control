import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import i18next from 'i18next';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initReactI18next } from 'react-i18next';

// The wizard reaches `~/message-hub`, the snackbar actions and error-handling
// through the geometry-sync thunk; stub them the same way device-list.test.tsx
// and geometry.test.ts do so the render/thunk seams stay lightweight and the
// sync round-trip is fully under the test's control.
const mockSendMessage =
  jest.fn<(request: { op?: string }) => Promise<{ body: unknown }>>();
jest.mock('~/message-hub', () => ({
  __esModule: true,
  // Wrapper defers reading `mockSendMessage` to call time: the factory runs
  // while the const is still uninitialized, but every real call happens later.
  default: {
    sendMessage: (request: { op?: string }) => mockSendMessage(request),
  },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

import { configureStore } from '@reduxjs/toolkit';

import { syncGeometryToFleet } from '~/features/rtls/geometry-actions';
import { CalibrationDoneMessage } from '~/features/rtls/RtlsCalibrationWizard';
import {
  getRtlsGeometryCheck,
  isRtlsGeometrySyncing,
} from '~/features/rtls/selectors';
import rtlsReducer from '~/features/rtls/slice';
import { type RtlsGeometryCheck } from '~/features/rtls/types';
import { type AppDispatch, type RootState } from '~/store/reducers';
import en from '~/i18n/en.json';

const render = (node: React.ReactElement): string => renderToStaticMarkup(node);

beforeAll(async () => {
  // Real English resources so the assertions match what the operator reads;
  // the ~/i18n module is stubbed in jest, so wire up i18next directly (the
  // async init cannot live at module top level under the CommonJS transform).
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

describe('CalibrationDoneMessage (the done-step body)', () => {
  test('while syncing it shows an active spinner + the writing text', () => {
    // This is the branch that used to be dead code: apply() only reached the
    // done step AFTER the sync had already cleared `syncing`, so the operator
    // never saw it. The corrected apply() switches to the done step as the
    // write starts, so this render is now what shows during the whole write.
    const markup = render(
      <CalibrationDoneMessage syncing={true} check={undefined} />
    );
    expect(markup).toContain('MuiCircularProgress');
    expect(markup).toContain('Writing the geometry to the fleet');
  });

  test('a consistent verdict renders once syncing clears, without a spinner', () => {
    const check: RtlsGeometryCheck = {
      consistent: true,
      devices: {},
      receivedAt: 1,
    };
    const markup = render(
      <CalibrationDoneMessage syncing={false} check={check} />
    );
    expect(markup).toContain('checks consistent');
    expect(markup).not.toContain('MuiCircularProgress');
  });

  test('an out-of-sync verdict renders once syncing clears, without a spinner', () => {
    const check: RtlsGeometryCheck = {
      consistent: false,
      devices: { '63': { status: 'mismatch' } },
      receivedAt: 1,
    };
    const markup = render(
      <CalibrationDoneMessage syncing={false} check={check} />
    );
    expect(markup).toContain('still out of sync');
    expect(markup).not.toContain('MuiCircularProgress');
  });

  test('no check yet renders the unchecked verdict, without a spinner', () => {
    const markup = render(
      <CalibrationDoneMessage syncing={false} check={undefined} />
    );
    expect(markup).toContain('Run a consistency check');
    expect(markup).not.toContain('MuiCircularProgress');
  });
});

describe('write-start ordering (what the corrected apply() lands on)', () => {
  // A store with just the rtls slice is all the geometry thunk touches; cast
  // its dispatch/state to the app types (the thunk is written against the full
  // RootState) exactly as the app would supply them.
  const makeStore = () => {
    const store = configureStore({ reducer: { rtls: rtlsReducer } });
    return {
      dispatch: store.dispatch as AppDispatch,
      getState: () => store.getState() as unknown as RootState,
    };
  };

  const geoBody = (body: Record<string, unknown>) => ({
    body: { type: 'X-RTLS-GEO', ...body },
  });

  test('syncing is already true the instant the write starts, and the verdict lands after it settles', async () => {
    // A pending sync round-trip: the tag write + reboot has left the client
    // but not returned. This is the exact window the wizard now spends on the
    // done step showing "Writing…".
    let resolveSync!: (value: { body: unknown }) => void;
    const syncPending = new Promise<{ body: unknown }>((resolve) => {
      resolveSync = resolve;
    });
    mockSendMessage.mockImplementation((request) => {
      if (request.op === 'sync') {
        return syncPending;
      }
      // the automatic post-sync consistency re-check
      return Promise.resolve(
        geoBody({ op: 'check', consistent: true, devices: {} })
      );
    });

    const store = makeStore();
    expect(isRtlsGeometrySyncing(store.getState())).toBe(false);

    const pending = store.dispatch(
      syncGeometryToFleet({ geometry: { UWB_AN1_X: 10 }, reboot: true })
    );

    // Synchronously after dispatch — before the sync round-trip resolves —
    // rtlsGeometrySyncStarted has already flipped `syncing` true. A wizard that
    // switches to the done step here therefore renders the syncing-true branch.
    expect(isRtlsGeometrySyncing(store.getState())).toBe(true);

    resolveSync(
      geoBody({
        op: 'sync',
        consistent: true,
        devices: {
          '62': { status: 'synced', written: ['UWB_AN1_X'], rebooted: true },
        },
      })
    );
    const outcome = await pending;

    // Once the write settles, `syncing` flips false and the consistency
    // snapshot is stored, so the done step now renders the verdict.
    expect(outcome).toBe('synced');
    expect(isRtlsGeometrySyncing(store.getState())).toBe(false);
    expect(getRtlsGeometryCheck(store.getState())?.consistent).toBe(true);
  });
});
