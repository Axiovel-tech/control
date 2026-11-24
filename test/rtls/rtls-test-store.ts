/**
 * @file A small typed store for the RTLS thunk tests: the RTLS slice and
 * just enough of the UAV registry (the armed-drone checks read it), with
 * helpers to run app thunks against it and to answer the message hub and
 * the confirmation prompt.
 */

import { configureStore, createSlice } from '@reduxjs/toolkit';

import reducer from '~/features/rtls/slice';
import { type PromptResponse } from '~/features/prompt/types';
import type UAVErrorCode from '~/flockwave/UAVErrorCode';
import { type Message } from '~/flockwave/types';
import { type UAVAge } from '~/model/uav';
import {
  type AppDispatch,
  type AppThunk,
  type RootState,
} from '~/store/reducers';

export type FakeUav = {
  id: string;
  age?: UAVAge;
  armed?: boolean;
  errors: UAVErrorCode[];
};

export const createRtlsTestStore = (uavs: FakeUav[] = []) => {
  const uavSlice = createSlice({
    name: 'uavs',
    initialState: {
      byId: Object.fromEntries(uavs.map((uav) => [uav.id, uav])),
      order: uavs.map((uav) => uav.id),
    },
    reducers: {},
  });
  return configureStore({
    reducer: { rtls: reducer, uavs: uavSlice.reducer },
  });
};

export type RtlsTestStore = ReturnType<typeof createRtlsTestStore>;

/**
 * The test store's state as the app's: it carries only the slices the RTLS
 * code reads, and the real state has them all.
 */
export const rootStateOf = (store: RtlsTestStore): RootState =>
  store.getState() as RootState;

/** Runs an app thunk against the test store. */
export const dispatchThunk = <R>(store: RtlsTestStore, thunk: AppThunk<R>) =>
  thunk(store.dispatch as AppDispatch, () => rootStateOf(store), undefined);

/** A server reply carrying the given body. */
export const reply = (
  body: { type: string } & Record<string, unknown>
): Message => ({
  '$fw.version': '1.0',
  id: 'test-reply',
  body,
});

/** The operator's answer to the confirmation dialog (a prompt thunk). */
export const answer =
  (confirmed: boolean): AppThunk<Promise<PromptResponse>> =>
  () =>
    Promise.resolve({ confirmed });
