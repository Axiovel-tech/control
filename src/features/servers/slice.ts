/**
 * @file Slice of the state object that stores the list of currently detected
 * servers and the state of the connection to the current one.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { ConnectionState } from '~/model/enums';
import {
  clearOrderedCollection,
  type Collection,
  EMPTY_COLLECTION,
} from '~/utils/collections';
import { noPayload } from '~/utils/redux';

import { type ServerParameters } from './types';
import { addServer } from './utils';

export type ServersSliceState = {
  current: {
    features: Record<string, boolean>;
    ports: Record<string, number>;
    state: ConnectionState;
    // TODO: Do `adjusting` and `calculating` really need to be optional?
    //       (Get rid of `... | undefined` in selectors as well if possible!)
    timeSync: {
      adjusting?: boolean;
      adjustmentResult?: boolean;
      calculating?: boolean;
      clockSkew?: number;
      roundTripTime?: number;
    };
    version?: string;
  };
  isScanning: boolean;
  detected: Collection<ServerParameters>;
  timeSyncDialog: {
    open: boolean;
  };
};

const initialState: ServersSliceState = {
  current: {
    features: {},
    ports: {},
    state: ConnectionState.DISCONNECTED,
    timeSync: {
      adjusting: false,
      adjustmentResult: undefined,
      calculating: false,
      clockSkew: undefined,
      roundTripTime: undefined,
    },
    version: undefined,
  },
  isScanning: false,
  detected: EMPTY_COLLECTION,
  timeSyncDialog: {
    open: false,
  },
};

const { actions, reducer } = createSlice({
  name: 'servers',
  initialState,
  reducers: {
    /**
     * Adds a detected server to the list of detected servers in the server
     * registry.
     *
     * The action will receive a property named `key` when the addition is
     * completed; this will contain an opaque identifier that can be used later
     * in other actions to refer to the entry that was just created.
     */
    addDetectedServer(
      state,
      action: PayloadAction<Omit<ServerParameters, 'id' | 'type'>>
    ) {
      addServer(state, 'detected', action);
    },

    /**
     * Adds a server whose settings were inferred in the absence of a reliable
     * detection mechanism (such as SSDP) to the list of detected servers in
     * the server registry.
     *
     * The action will receive a property named `key` when the addition is
     * completed; this will contain an opaque identifier that can be used later
     * in other actions to refer to the entry that was just created.
     */
    addInferredServer(
      state,
      action: PayloadAction<Omit<ServerParameters, 'id' | 'type'>>
    ) {
      addServer(state, 'inferred', action);
    },

    /**
     * Adds one or more new features to the list of features supported by the server.
     */
    addServerFeatures(
      state,
      action: PayloadAction<Array<string | { name: string; data: boolean }>>
    ) {
      let { payload } = action;

      if (!Array.isArray(payload)) {
        payload = [payload];
      }

      for (let item of payload) {
        if (typeof item !== 'object') {
          item = { name: String(item), data: true };
        }

        const { name, data } = item;
        state.current.features[name] = data;
      }
    },

    /**
     * Notifies the state store that we have started adjusting the time on the
     * server.
     */
    adjustServerTimePromisePending(state) {
      state.current.timeSync.adjusting = true;
      state.current.timeSync.adjustmentResult = undefined;
    },

    /**
     * Notifies the state store that we have finished adjusting the time on the
     * server successfully.
     */
    adjustServerTimePromiseFulfilled(state) {
      state.current.timeSync.adjusting = false;
      state.current.timeSync.adjustmentResult = true;
    },

    /**
     * Notifies the state store that we have finished adjusting the time on the
     * server and the attempt failed.
     */
    adjustServerTimePromiseRejected(state) {
      state.current.timeSync.adjusting = false;
      state.current.timeSync.adjustmentResult = false;
    },

    /**
     * Clears the list of features that we know are supported on the server that
     * we are connected to.
     */
    clearServerFeatures(state) {
      state.current.features = {};
    },

    /**
     * Clears the information about the current mapping of services to ports on
     * the server.
     */
    clearServerPortMapping(state) {
      state.current.ports = {};
    },

    /**
     * Clears the time synchronization related statistics of the current server.
     */
    clearTimeSyncStatistics(state) {
      state.current.timeSync = {
        clockSkew: undefined,
        roundTripTime: undefined,
      };
    },

    /**
     * Notifies the state store that we have started calculating the clock skew
     * between the client and the server.
     */
    calculateClockSkewPromisePending(state) {
      state.current.timeSync.calculating = true;
    },

    /**
     * Notifies the state store that we have finished calculating the clock skew
     * between the client and the server and that we have a result.
     */
    calculateClockSkewPromiseFulfilled(
      state,
      action: PayloadAction<{ clockSkew?: number; roundTripTime?: number }>
    ) {
      state.current.timeSync.calculating = false;

      const { clockSkew, roundTripTime } = action.payload;
      state.current.timeSync.clockSkew =
        typeof clockSkew === 'number' && Number.isFinite(clockSkew)
          ? clockSkew
          : undefined;
      state.current.timeSync.roundTripTime =
        typeof roundTripTime === 'number' && Number.isFinite(roundTripTime)
          ? roundTripTime
          : undefined;
    },

    /**
     * Notifies the state store that we have finished calculating the clock skew
     * between the client and the server and the process terminated with an error.
     */
    calculateClockSkewPromiseRejected(state) {
      state.current.timeSync.calculating = false;
    },

    /**
     * Closes the server-client time synchronization dialog.
     */
    closeTimeSyncWarningDialog: noPayload<ServersSliceState>((state) => {
      state.timeSyncDialog.open = false;
    }),

    /**
     * Opens the server-client time synchronization dialog.
     */
    openTimeSyncWarningDialog: noPayload<ServersSliceState>((state) => {
      state.timeSyncDialog.open = true;
    }),

    /**
     * Action factory that creates an action that removes all the previously
     * detected servers from the server registry.
     */
    removeAllDetectedServers(state) {
      clearOrderedCollection(state.detected);
    },

    /**
     * Action factory that creates an action that sets whether we are connected
     * to the current server that the user is trying to communicate with or not.
     */
    setCurrentServerConnectionState(
      state,
      action: PayloadAction<ConnectionState>
    ) {
      state.current.state = action.payload;
    },

    /**
     * Sets the mapping of services to ports in the server.
     */
    setServerPortMapping(
      state,
      { payload: ports }: PayloadAction<Record<string, number>>
    ) {
      state.current.ports = ports;
    },

    /**
     * Sets version information about the currently active server.
     */
    setServerVersion(state, { payload: version }: PayloadAction<string>) {
      state.current.version = version;
    },

    /**
     * Action factory that creates an action that notifies the store that the
     * scanning for servers has started.
     */
    startScanning(state) {
      state.isScanning = true;
    },

    /**
     * Action factory that creates an action that notifies the store that the
     * scanning for servers has stopped.
     */
    stopScanning(state) {
      state.isScanning = false;
    },

    /**
     * Updates the hostname of a server, used as a fallback when no
     * label is available for the server.
     */
    updateDetectedServerHostname(
      state,
      action: PayloadAction<{
        key: ServerParameters['id'];
        hostName: ServerParameters['hostName'];
      }>
    ) {
      const { key, hostName } = action.payload;
      const server = state.detected.byId[key];
      if (server) {
        // Server is still there, update the name
        server.hostName = hostName;
      }
    },

    /**
     * Updates the displayed label of a server.
     */
    updateDetectedServerLabel(
      state,
      action: PayloadAction<{
        key: ServerParameters['id'];
        label: ServerParameters['label'];
      }>
    ) {
      const { key, label } = action.payload;
      const server = state.detected.byId[key];
      if (server) {
        // Server is still there, update the name
        server.label = label;
      }
    },
  },
});

export const {
  addDetectedServer,
  addInferredServer,
  addServerFeatures,
  clearServerFeatures,
  clearServerPortMapping,
  clearTimeSyncStatistics,
  closeTimeSyncWarningDialog,
  openTimeSyncWarningDialog,
  removeAllDetectedServers,
  setCurrentServerConnectionState,
  setServerPortMapping,
  setServerVersion,
  startScanning,
  stopScanning,
  updateDetectedServerHostname,
  updateDetectedServerLabel,
} = actions;

export default reducer;
