import { errorToString } from '~/error-handling';
import { showErrorMessage } from '~/features/error-handling/actions';
import { updateFlatEarthCoordinateSystem } from '~/features/map/origin';
import { recalculateMapping } from '~/features/mission/actions';
import {
  setOutdoorShowAltitudeReferenceToAverageAMSL,
  updateOutdoorShowSettings,
} from '~/features/show/actions';
import { normalizeShowOrientation } from '~/features/show/orientation';
import type { AppThunk } from '~/store/reducers';
import { createAsyncAction } from '~/utils/redux';
import workers from '~/workers';

import {
  canEstimateShowCoordinateSystemFromActiveUAVs,
  getShowCoordinateSystemFittingProblemFromState,
} from './selectors';
import type {
  CoordinateSystemEstimate,
  CoordinateSystemFittingProblem,
} from './types';

type DoEsimateArgs = {
  problem: CoordinateSystemFittingProblem;
  result?: CoordinateSystemEstimate;
};

const doEstimate = createAsyncAction(
  'show/coordinateSystemEstimation',
  async (args: DoEsimateArgs) => {
    const { problem } = args;
    args.result = await workers.estimateShowCoordinateSystem(problem);
  }
);

/**
 * Action thunk that estimates the coordinate system of the show based on the
 * current positions of the active UAVs.
 */
export const estimateShowCoordinateSystemFromActiveUAVs =
  (): AppThunk => async (dispatch, getState) => {
    const state = getState();

    if (!canEstimateShowCoordinateSystemFromActiveUAVs(state)) {
      return;
    }

    const args: DoEsimateArgs = {
      problem: getShowCoordinateSystemFittingProblemFromState(state),
      result: undefined,
    };

    try {
      // TODO: Properly integrate `redux-promise-middleware` into `AppDispatch`!
      await (dispatch(doEstimate(args)) as unknown as Promise<unknown>);
    } catch (error) {
      console.error(error);
      console.log('Problem description:', args.problem);
      dispatch(
        showErrorMessage(
          errorToString(error, 'Failed to calculate show coordinate system')
        )
      );
      return;
    }

    const { origin, orientation, type } = args.result!;

    // Normalized into [0, 360): a fitted negative angle (e.g. -1.4°) would
    // otherwise end up in the drones' SHOW_ORIENTATION parameter, where any
    // negative value silently means "show not configured" (see
    // ~/features/show/orientation.ts).
    dispatch(
      updateOutdoorShowSettings({
        origin,
        orientation: String(normalizeShowOrientation(orientation.toFixed(1))),
        setupMission: true,
      })
    );

    dispatch(setOutdoorShowAltitudeReferenceToAverageAMSL());
    dispatch(recalculateMapping());

    /* Keep the origin of the map coordinate system in sync with the show
     * coordinate system so map-local coordinates stay aligned with the venue */
    dispatch(
      updateFlatEarthCoordinateSystem({
        position: origin,
        // Normalized the same way as the show orientation above so the two
        // coordinate systems keep the exact same angle string.
        angle: String(normalizeShowOrientation(orientation.toFixed(1))),
        type,
      })
    );
  };
