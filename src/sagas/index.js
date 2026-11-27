/**
 * The root saga of the Axio Control application.
 */

import { all } from 'redux-saga/effects';

import beaconSaga from '~/features/beacons/saga';
import hotkeySaga from '~/features/hotkeys/saga';
import localServerSaga from '~/features/local-server/saga';
import venueSaga from '~/features/map/venue-saga';
import rtlsSaga from '~/features/rtls/saga';
import rtlsSolveRateTargetSaga from '~/features/rtls/solve-rate-saga';
import showAudioSaga from '~/features/show-audio/saga';
import showSaga from '~/features/show/saga';
import threeDViewSaga from '~/features/three-d/saga';
import uavManagementSaga from '~/features/uavs/saga';
import uploadSaga from '~/features/upload/saga';
import flock from '~/flock';
import { hasFeature } from '~/utils/configuration';

import onboardingSaga from './onboarding';

/**
 * The root saga of the Axio Control application.
 */
export default function* rootSaga() {
  const { localServer } = (window ? window.bridge : null) || {};
  const sagas = [
    hotkeySaga(),
    onboardingSaga(),
    rtlsSaga(),
    rtlsSolveRateTargetSaga(),
    showSaga(),
    showAudioSaga(),
    threeDViewSaga(),
    uavManagementSaga(flock),
    uploadSaga(),
    venueSaga(),
  ];

  if (localServer && localServer.search) {
    sagas.push(localServerSaga(localServer.search));
  }

  if (hasFeature('beacons')) {
    sagas.push(beaconSaga());
  }

  yield all(sagas);
}
