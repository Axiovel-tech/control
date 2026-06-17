/**
 * @file Thunk actions for the RTLS feature.
 */

import { type AppThunk } from '~/store/reducers';

import { handleRtlsInformationMessage, handleRtlsStatsMessage } from './handlers';

/**
 * Thunk that requests the current RTLS device inventory from the server and
 * updates the Redux store with the result.
 *
 * The message hub is injected so the thunk has no hard dependency on the
 * singleton, which keeps it testable.
 */
export const refreshRtlsDevices =
  (hub: {
    sendMessage: (body: unknown) => Promise<{ body: Record<string, unknown> }>;
  }): AppThunk<Promise<void>> =>
  async (dispatch) => {
    const response = await hub.sendMessage({ type: 'X-RTLS-INF' });
    handleRtlsInformationMessage(response.body, dispatch);
  };

/**
 * Thunk that requests the current RTLS statistics from the server and updates
 * the Redux store with the result.
 */
export const refreshRtlsStats =
  (hub: {
    sendMessage: (body: unknown) => Promise<{ body: Record<string, unknown> }>;
  }): AppThunk<Promise<void>> =>
  async (dispatch) => {
    const response = await hub.sendMessage({ type: 'X-RTLS-STATS' });
    handleRtlsStatsMessage(response.body, dispatch);
  };
