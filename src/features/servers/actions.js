import isNil from 'lodash-es/isNil';

import { wrapInErrorHandler } from '~/error-handling';
import {
  adjustServerTimeToMatchLocalTime as adjustServerTimeToMatchLocalTime_,
  estimateClockSkewAndRoundTripTime,
} from '~/flockwave/timesync';
import { createAsyncAction } from '~/utils/redux';

import { actions as serverSettingsDialogActions } from './server-settings-dialog';
import { getClockSkewInMilliseconds } from './selectors';

export const {
  closeServerSettingsDialog,
  disconnectFromServer,
  setServerSettingsDialogTab,
  showServerSettingsDialog,
  updateServerSettings,
} = serverSettingsDialogActions;

/**
 * Calculates the clock skew and round-trip time to the server, and stores the
 * result in the Redux store.
 *
 * @param {string} method  the method to use for the calculation; one of
 *        `simple`, `threshold` and `accurate`. `simple` sends a single SYS-TIME
 *        message to the server, estimates the clock skew and the round-trip
 *        time from that single message and stores the result in the state store.
 *        `threshold` repeats the measurement until the round-trip time falls
 *        under a reasonable threshold or until a given number of tries is
 *        exceeded, whichever happens first. `accurate` repeats the measurement
 *        ten times, averages the round-trip times, throwing away the largest
 *        two (probably outliers), and calculates the clock skew from the three
 *        responses with the fastest round-trip times.
 */
export const calculateAndStoreClockSkew = createAsyncAction(
  'servers/calculateClockSkew',
  estimateClockSkewAndRoundTripTime
);

export const calculateAndStoreClockSkewWithMinDelay = createAsyncAction(
  'servers/calculateClockSkew',
  estimateClockSkewAndRoundTripTime,
  { minDelay: 1000 }
);

const adjustServerTimeToMatchLocalTimeWithKnownDelay = createAsyncAction(
  'servers/adjustServerTime',
  adjustServerTimeToMatchLocalTime_,
  { minDelay: 1000 }
);

export const adjustServerTimeToMatchLocalTime = (messageHub) =>
  wrapInErrorHandler((dispatch, getState) => {
    const clockSkew = getClockSkewInMilliseconds(getState());

    if (isNil(clockSkew)) {
      throw new Error('Clock skew between server and client is not known');
    }

    dispatch(
      adjustServerTimeToMatchLocalTimeWithKnownDelay(messageHub, clockSkew)
    );

    dispatch(calculateAndStoreClockSkew(messageHub, { method: 'accurate' }));
  });
