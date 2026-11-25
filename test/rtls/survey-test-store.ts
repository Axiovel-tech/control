/**
 * @file The store of the survey tests: the RTLS slices and just enough of
 * the UAV registry and the show slice for the guard, a cell of four online
 * anchors, and a player for the recorded X-RTLS-SURVEY messages.
 */

import { configureStore, createSlice } from '@reduxjs/toolkit';

import { rtlsInformationActions } from '~/features/rtls/handlers';
import rtlsReducer from '~/features/rtls/slice';
import surveyReducer, {
  handleRtlsSurveyMessage,
  rtlsSurveyAnswered,
  rtlsSurveyRequested,
} from '~/features/rtls/survey';
import { mapRtlsSurveyAnswer } from '~/features/rtls/survey-messages';
import {
  type AppDispatch,
  type AppThunk,
  type RootState,
} from '~/store/reducers';

import { type FakeUav } from './rtls-test-store';
import { type RecordedMessage } from './survey-recording';

export const CELL = 'bench';

/** An anchor of a test cell; online and without a stored position unless said. */
export type TestAnchor = {
  id: number;
  slot: number;
  cell?: string;
  online?: boolean;
  stored?: { north: number; east: number };
};

/** The X-RTLS-INF of the given anchors, with `lockedCount` of them locked. */
export const informationOf = (anchors: TestAnchor[], lockedCount = 0) => ({
  status: Object.fromEntries(
    anchors.map(({ id, online = true, slot }) => [
      String(id),
      {
        online,
        role: slot === 0 ? 'anchor-initiator' : 'anchor-responder',
        name: `RTLS anchor A${slot}`,
      },
    ])
  ),
  anchors: anchors.map(({ cell = CELL, id, online = true, slot, stored }) => ({
    id: `rtls::${cell}::anchor_${slot}`,
    cell,
    index: slot,
    mac: id,
    systemId: id,
    active: online,
    ned: stored ?? null,
  })),
  anchorLock: {
    locked: lockedCount === anchors.length,
    lockedCount,
    anchorCount: anchors.length,
  },
});

/** Anchors 101..104 of the cell; only the first three store a position. */
export const FOUR_ANCHORS: TestAnchor[] = [
  { id: 101, slot: 0, stored: { north: 0, east: 0 } },
  { id: 102, slot: 1, stored: { north: 4, east: 0 } },
  { id: 103, slot: 2, stored: { north: 0, east: 3 } },
  { id: 104, slot: 3 },
];

/** The X-RTLS-INF of the four anchors, with `lockedCount` of them locked. */
export const information = (lockedCount: number) =>
  informationOf(FOUR_ANCHORS, lockedCount);

/** Four online anchors of one cell, unlocked, with no drone and no show. */
export const createSurveyTestStore = ({
  uavs = [],
  authorized = false,
}: { uavs?: FakeUav[]; authorized?: boolean } = {}) => {
  const uavSlice = createSlice({
    name: 'uavs',
    initialState: {
      byId: Object.fromEntries(uavs.map((uav) => [uav.id, uav])),
      order: uavs.map((uav) => uav.id),
    },
    reducers: {},
  });
  const showSlice = createSlice({
    name: 'show',
    initialState: { start: { authorized } },
    reducers: {},
  });
  const store = configureStore({
    reducer: {
      rtls: rtlsReducer,
      rtlsSurvey: surveyReducer,
      uavs: uavSlice.reducer,
      show: showSlice.reducer,
    },
  });
  for (const action of rtlsInformationActions(information(0))) {
    store.dispatch(action);
  }
  return store;
};

export type SurveyTestStore = ReturnType<typeof createSurveyTestStore>;

/** Replaces the anchors the server reports. */
export const reportAnchors = (
  store: SurveyTestStore,
  anchors: TestAnchor[],
  lockedCount = 0
): void => {
  for (const action of rtlsInformationActions(
    informationOf(anchors, lockedCount)
  )) {
    store.dispatch(action);
  }
};

/** The test store's state as the app's: it has every slice this code reads. */
export const stateOf = (store: SurveyTestStore): RootState =>
  store.getState() as RootState;

export const run = <R>(store: SurveyTestStore, thunk: AppThunk<R>): R =>
  thunk(store.dispatch as AppDispatch, () => stateOf(store), undefined);

/** Plays recorded messages into the store as the hub would deliver them. */
export const play = (
  store: SurveyTestStore,
  messages: RecordedMessage[]
): void => {
  for (const message of messages) {
    if ('pushed' in message) {
      handleRtlsSurveyMessage(message.body, store.dispatch as AppDispatch);
    } else {
      if (message.answerTo !== 'status') {
        store.dispatch(rtlsSurveyRequested(message.answerTo));
      }
      store.dispatch(
        rtlsSurveyAnswered({
          answer: mapRtlsSurveyAnswer(message.answerTo, message.body),
        })
      );
    }
  }
};
