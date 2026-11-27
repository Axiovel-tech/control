import type { PayloadAction } from '@reduxjs/toolkit';
import isNil from 'lodash-es/isNil';
import xor from 'lodash-es/xor';

import { setSelection } from '~/features/selection/slice';
import flock from '~/flock';
import { uavIdToGlobalId } from '~/model/identifiers';
import type { AppThunk } from '~/store/reducers';
import { setColorOnUAVs, turnOffColorOverrideOnUAVs } from '~/utils/messaging';

import { getSelectedUAVIds, getUAVIdsMarkedAsGone } from './selectors';
import { _setLEDColorOverride } from './slice';

/**
 * Clears any color override related to the given UAV.
 */
export const clearUAVColorOverride =
  (ids: string[]): AppThunk =>
  (dispatch) => {
    dispatch(overrideUAVColor(ids, null));
  };

/**
 * Clears all color overrides.
 */
export const clearAllUAVColorOverrides =
  (): AppThunk => (dispatch, getState) => {
    const state = getState();
    const ids = Object.keys(state.uavs.lights);
    dispatch(clearUAVColorOverride(ids));
  };

/**
 * Overrides the color of the UAV with the given ID to the given color. While
 * the lights are not controlled from the GCS (the main switch of the light
 * control panel), the colour is only kept, and goes out when they are.
 */
export const overrideUAVColor =
  (ids: string[], color: string | null): AppThunk =>
  (dispatch, getState) => {
    if (color) {
      if (getState().lightControl.active) {
        void setColorOnUAVs(ids, { color });
      }
    } else {
      void turnOffColorOverrideOnUAVs(ids, {});
    }
    dispatch(_setLEDColorOverride({ ids, color }));
  };

/**
 * Action factory that returns a thunk that requests the global flock object
 * to remove the UAVs given by their IDs from the flock. The flock will in turn
 * dispatch events when the removal is done, and these events will in turn
 * update the store and remove the UAVs from there as well.
 */
export const requestRemovalOfUAVsByIds = (selection: string[]) => (): void => {
  if (selection.length > 0) {
    flock.removeUAVsByIds(selection);
  }
};

/**
 * Action factory that returns a thunk that removes the UAVs that are marked
 * as gone from the list of known UAVs.
 */
export const requestRemovalOfUAVsMarkedAsGone =
  (): AppThunk => (dispatch, getState) => {
    const selection = getUAVIdsMarkedAsGone(getState());
    if (selection.length > 0) {
      dispatch(requestRemovalOfUAVsByIds(selection));
    }
  };

/**
 * Action factory that returns a thunk that removes the selected UAVs from the
 * list of known UAVs.
 */
export const requestRemovalOfSelectedUAVs =
  (): AppThunk => (dispatch, getState) => {
    const selection = getSelectedUAVIds(getState()).filter(Boolean);
    if (selection.length > 0) {
      dispatch(requestRemovalOfUAVsByIds(selection));
    }
  };

/**
 * Action factory that creates an action that sets the set of selected
 * UAV IDs in the map.
 *
 * @param {Array.<string>} ids  the IDs of the selected UAVs. Any UAV
 *        whose ID is not in this set will be deselected, and so will be
 *        any feature that is not an UAV.
 * @return {Object} an appropriately constructed action
 */
export const setSelectedUAVIds = (ids: string[]): PayloadAction<string[]> =>
  setSelection(
    (Array.isArray(ids) ? ids : [])
      .filter((id) => !isNil(id))
      .map((id) => uavIdToGlobalId(id))
  );

/**
 * Action factory that returns a thunk that toggles the selection of one or more
 * UAV IDs when dispatched.
 *
 * @param {Array.<string>} ids  the IDs of the UAVs to toggle.
 */
export const toggleUAVIdsInSelection =
  (ids: string[]): AppThunk =>
  (dispatch, getState) => {
    if (ids.length === 0) {
      return;
    }

    const selection = getSelectedUAVIds(getState());
    dispatch(setSelectedUAVIds(xor(selection, ids)));
  };
