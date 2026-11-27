import createColor from 'color';
import throttle from 'lodash-es/throttle';

import { showError } from '~/features/snackbar/actions';
import {
  clearAllUAVColorOverrides,
  clearUAVColorOverride,
} from '~/features/uavs/actions';
import {
  getColorOverrideToUAVIdsMap,
  getSelectedUAVIds,
} from '~/features/uavs/selectors';
import { _setLEDColorOverride } from '~/features/uavs/slice';
import messageHub from '~/message-hub';
import { setColorOnUAVs, turnOffColorOverrideOnUAVs } from '~/utils/messaging';

import {
  getFleetColorInLightControlPanel,
  getLightControlTarget,
  isFleetColorOn,
  isLightControlActive,
} from './selectors';
import {
  setColor,
  setFleetColorOn,
  setLightControlActive,
  setSelectedColor,
} from './slice';

/**
 * Sends a colour to the given drones, at most a few times a second while the
 * colour picker is dragged; the last colour always goes out.
 */
const sendColorToUAVs = throttle(
  (ids, color) => {
    void setColorOnUAVs(ids, { color });
  },
  250,
  { leading: true, trailing: true }
);

/**
 * Thunk that gives the selected drones a colour of their own, while the
 * lights are controlled from the GCS: the main switch has the last word, so
 * with it off no drone gets a colour from here.
 */
const setColorOnSelectedUAVs = (color) => (dispatch, getState) => {
  const state = getState();
  const ids = getSelectedUAVIds(state);
  dispatch(setSelectedColor(color));
  if (isLightControlActive(state) && ids.length > 0) {
    dispatch(_setLEDColorOverride({ ids, color }));
    sendColorToUAVs(ids, color);
  }
};

/**
 * Thunk that gives the selected drones back to the fleet colour, or to their
 * own light program if the fleet colour is off.
 */
export const releaseSelectedUAVColors = () => (dispatch, getState) => {
  const ids = getSelectedUAVIds(getState());
  if (ids.length > 0) {
    dispatch(clearUAVColorOverride(ids));
  }
};

/**
 * Thunk that gives every drone with a colour of its own back to the fleet
 * colour, or to its own light program if the fleet colour is off.
 */
export const releaseAllUAVColors = () => (dispatch) => {
  // a colour still waiting in the throttle must not follow the release
  sendColorToUAVs.cancel();
  dispatch(clearAllUAVColorOverrides());
};

/**
 * Thunk that sets the current color of the light control module, activates
 * it and sends an appropriate message to the server as a side effect.
 */
export const setColorAndActivate = (color) => (dispatch, getState) => {
  if (getLightControlTarget(getState()) === 'selected') {
    dispatch(setColorOnSelectedUAVs(color));
    return;
  }

  const wasActive = isLightControlActive(getState());
  dispatch(setColor(color));
  dispatch(setFleetColorOn(true));
  dispatch(setLightControlActive(true));
  if (!wasActive) {
    resumeOwnColors(getState);
  }

  submitShowLightConfigurationToServer(getState);
};

/**
 * Thunk that sets the current color of the light control module, and sends an
 * appropriate message to the server as a side effect if the module is active.
 */
export const setColorAndUpdateServerIfActive =
  (color) => (dispatch, getState) => {
    if (getLightControlTarget(getState()) === 'selected') {
      dispatch(setColorOnSelectedUAVs(color));
      return;
    }

    const isActive = isLightControlActive(getState());

    dispatch(setColor(color));

    if (isActive) {
      dispatch(setFleetColorOn(true));
      submitShowLightConfigurationToServer(getState);
    }
  };

/**
 * Thunk that takes the fleet colour off the drones while keeping the lights
 * controlled from the GCS: the drones go back to their own light program,
 * except the ones with a colour of their own.
 */
export const releaseFleetColor = () => (dispatch, getState) => {
  dispatch(setFleetColorOn(false));
  if (isLightControlActive(getState())) {
    submitShowLightConfigurationToServer(getState);
  }
};

/**
 * Thunk that toggles whether the light control module is currently active,
 * and also sends a message to the server as a side effect when the module is
 * turned on or off.
 */
export const toggleLightControlActive = () => (dispatch, getState) => {
  const isActive = isLightControlActive(getState());
  dispatch(setLightControlActive(!isActive));
  if (isActive) {
    pauseOwnColors(getState);
  } else {
    resumeOwnColors(getState);
  }

  submitShowLightConfigurationToServer(getState);
};

/**
 * Takes the drones' own colours off them while the lights are not controlled
 * from the GCS. The colours are kept, and come back with the control.
 */
function pauseOwnColors(getState) {
  // a colour still waiting in the throttle must not follow the pause
  sendColorToUAVs.cancel();
  const ids = Object.values(getColorOverrideToUAVIdsMap(getState())).flat();
  if (ids.length > 0) {
    void turnOffColorOverrideOnUAVs(ids, {});
  }
}

/**
 * Gives the drones their own colours back when the GCS takes control of the
 * lights again, without waiting for the next refresh.
 */
function resumeOwnColors(getState) {
  const colors = getColorOverrideToUAVIdsMap(getState());
  for (const [color, ids] of Object.entries(colors)) {
    void setColorOnUAVs(ids, { color });
  }
}

async function submitShowLightConfigurationToServer(getState) {
  const state = getState();
  const isActive = isLightControlActive(state);
  const color = getFleetColorInLightControlPanel(state);

  try {
    await messageHub.execute.setShowLightConfiguration({
      effect: isActive && isFleetColorOn(state) ? 'solid' : 'off',
      color: createColor(color).rgb().array(),
    });
  } catch {
    showError('Failed to update light configuration on the server.');
  }
}
