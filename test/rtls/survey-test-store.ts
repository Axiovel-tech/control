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

/** The X-RTLS-INF of the cell, with `lockedCount` of its anchors locked. */
export const information = (lockedCount: number) => ({
  status: Object.fromEntries(
    [101, 102, 103, 104].map((id, slot) => [
      String(id),
      {
        online: true,
        role: slot === 0 ? 'anchor-initiator' : 'anchor-responder',
        name: `RTLS anchor A${slot}`,
      },
    ])
  ),
  anchors: [101, 102, 103, 104].map((systemId, index) => ({
    id: `rtls::${CELL}::anchor_${index}`,
    cell: CELL,
    index,
    mac: 0x10 + index,
    systemId,
    active: true,
    // only the first three store a position
    ned:
      index < 3
        ? { north: index === 1 ? 4 : 0, east: index === 2 ? 3 : 0 }
        : null,
  })),
  anchorLock: { locked: lockedCount === 4, lockedCount, anchorCount: 4 },
});

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
