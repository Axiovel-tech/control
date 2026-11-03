import { errorToString } from '~/error-handling';
import { areFlightCommandsBroadcast } from '~/features/mission/selectors';
import { showError } from '~/features/snackbar/actions';
import { getSelectedUAVIds } from '~/features/uavs/selectors';
import i18n from '~/i18n';
import messageHub from '~/message-hub';
import type { AppThunk } from '~/store/reducers';

import {
  getInitialShowRTHSelection,
  getShowRTHTarget,
  type ShowRTHSelection,
} from './selection';
import { openShowRTHDialog, setShowRTHStatus } from './slice';

/**
 * Handles the RTH button.
 *
 * When drones hold a certified `.gdm` RTH plan, opens the dialog that selects
 * which of them return. Otherwise calls `fallback`, which is the RTH command
 * of a show without such a plan (every `.skyc` show).
 *
 * If the server cannot be asked, nothing is sent: a `.gdm` show must not
 * silently fall back to an uncertified RTH.
 */
export const requestReturnToHome =
  (fallback: () => void): AppThunk =>
  async (dispatch, getState) => {
    let planHolders: string[];
    try {
      planHolders = await messageHub.execute.getShowRTHPlanHolders();
    } catch (error) {
      showError(
        i18n.t('showRTHDialog.planQueryFailed', {
          error: errorToString(error),
        }),
        { permanent: true }
      );
      return;
    }

    if (planHolders.length === 0) {
      fallback();
      return;
    }

    const state = getState();
    dispatch(
      openShowRTHDialog({
        planHolders,
        initialSelection: getInitialShowRTHSelection({
          broadcast: areFlightCommandsBroadcast(state),
          planHolders,
          selectedUAVIds: getSelectedUAVIds(state),
        }),
      })
    );
  };

/**
 * Sends the selected drones home along their certified RTH paths.
 */
export const sendShowRTH =
  (selection: ShowRTHSelection): AppThunk =>
  async (dispatch) => {
    const target = getShowRTHTarget(selection);
    if (target === undefined) {
      return;
    }

    dispatch(setShowRTHStatus({ state: 'sending' }));
    try {
      const outcome = await messageHub.execute.startShowRTH(target);
      dispatch(setShowRTHStatus({ state: 'sent', ...outcome }));
    } catch (error) {
      dispatch(
        setShowRTHStatus({ state: 'error', error: errorToString(error) })
      );
    }
  };
