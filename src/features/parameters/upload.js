import { call, select } from 'redux-saga/effects';

import { getServerVersionValidator } from '~/features/servers/selectors';
import { normalizeShowOrientation } from '~/features/show/orientation';
import messageHub from '~/message-hub';

import { JOB_TYPE } from './constants';

const supportsBulkUpload = getServerVersionValidator('>=2.34.1');

/**
 * Marshals a single parameter value before it is sent to a drone.
 *
 * AC_DroneShowManager treats `orientation_deg >= 0` as "set by the user" and
 * ANY negative SHOW_ORIENTATION as the unset sentinel, silently marking the
 * show as not configured (see ~/features/show/orientation.ts — this blocked a
 * live show on 2026-07-21 with a value of -1.4°), so the angle is normalized
 * into [0, 360) here as well. All other parameters pass through unchanged.
 */
const marshalParameterValue = (name, value) =>
  name === 'SHOW_ORIENTATION' ? normalizeShowOrientation(value) : value;

/**
 * Handles a parameter upload session to a single drone. Returns a promise that
 * resolves when all the parameters have been uploaded. The promise is extended
 * with a cancellation callback for Redux-saga.
 *
 * @param uavId    the ID of the UAV to upload the parameters to
 * @param payload  the parameters to upload
 */
function* runSingleParameterUpload({ uavId, payload }, options) {
  const { items, meta } = payload ?? {};

  if (!Array.isArray(items)) {
    return;
  }

  const uavItems = items.filter(
    (param) => param.uavId === undefined || param.uavId === uavId
  );
  if (uavItems.length === 0) {
    return;
  }

  const useBulkUpload = yield select(supportsBulkUpload);

  if (useBulkUpload) {
    const parameters = Object.fromEntries(
      uavItems.map(({ name, value }) => [
        name,
        marshalParameterValue(name, value),
      ])
    );

    // No need for a timeout here; it utilizes the message hub, which has its
    // own timeout for failed command executions (although it is quite long)
    yield call(
      messageHub.execute.setParameters,
      { uavId, parameters },
      options
    );
  } else {
    for (const { name, value } of uavItems) {
      // No need for a timeout here; it utilizes the message hub, which has its
      // own timeout for failed command executions (although it is quite long)
      yield call(messageHub.execute.setParameter, {
        uavId,
        name,
        value: marshalParameterValue(name, value),
      });
    }
  }

  const { shouldReboot } = meta ?? {};
  if (shouldReboot) {
    yield call(messageHub.execute.resetUAV, uavId);
  }
}

const spec = {
  executor: runSingleParameterUpload,
  title: 'Upload parameters',
  type: JOB_TYPE,
};

export default spec;
