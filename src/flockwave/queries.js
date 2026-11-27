/**
 * Functions for handling common queries to the Flockwave server using
 * promises.
 */

import get from 'lodash-es/get';
import sortBy from 'lodash-es/sortBy';
import memoize from 'memoizee';
import { toScaledJSONFromLonLat } from '~/utils/geography';

import { errorToString } from '~/error-handling';

import { extractResponseForId } from './parsing';
import { validateExtensionName } from './validation';

/**
 * Adapts the given base64-encoded show using the given transformation
 * definitions and coordinate system.
 */
export async function adaptShow(hub, show, transformations, coordinateSystem) {
  const response = await hub.sendMessage(
    {
      type: 'X-SHOW-ADAPT',
      show,
      transformations,
      environment: {
        location: {
          origin: toScaledJSONFromLonLat(coordinateSystem.origin),
          orientation: coordinateSystem.orientation,
        },
      },
    },
    // Use a very long timeout for this message as the transformations
    // require a lot of computation.
    { timeout: 600 }
  );

  if (response?.body?.type === 'X-SHOW-ADAPT') {
    return response.body;
  } else {
    throw new Error(response?.body?.reason ?? 'Unknown error.');
  }
}

/**
 * Returns the basic properties of the beacons with the given IDs.
 */
export async function getBasicBeaconProperties(hub, ids) {
  let isSingle = false;

  if (typeof ids === 'string') {
    ids = [ids];
    isSingle = true;
  }

  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    throw new Error('Invalid ID array:' + JSON.stringify(ids));
  }

  const response = await hub.sendMessage({
    type: 'BCN-PROPS',
    ids,
  });

  if (isSingle) {
    return extractResponseForId(response, ids[0], {
      key: 'result',
      error: `Failed to retrieve basic properties of beacon: ${ids[0]}`,
    });
  } else {
    return response.body.result;
  }
}

/**
 * Returns the current configuration object of the server extension with the
 * given name.
 */
export async function getConfigurationOfExtension(hub, name) {
  validateExtensionName(name);

  const response = await hub.sendMessage({
    type: 'EXT-CFG',
    ids: [name],
  });

  return extractResponseForId(response, name, {
    error: `Failed to retrieve configuration for extension: ${name}`,
  });
}

/**
 * Returns a single flight log from a UAV.
 */
export async function getFlightLog(hub, uavId, logId, { onProgress } = {}) {
  if (!uavId || typeof uavId !== 'string') {
    throw new Error('Expected non-empty UAV ID');
  }

  if (!logId || typeof logId !== 'string') {
    throw new Error('Expected non-empty log ID');
  }

  let response;

  try {
    response = await hub.startAsyncOperationForSingleId(
      uavId,
      {
        type: 'LOG-DATA',
        logId,
        uavId,
      },
      { idProp: null, onProgress, single: true }
    );
  } catch (error) {
    const errorString = errorToString(error);
    throw new Error(
      `Failed to retrieve log ${logId} for UAV ${uavId}: ${errorString}`
    );
  }

  return response;
}

/**
 * Returns the list of flight logs on a single UAV.
 */
export async function getFlightLogList(hub, uavId) {
  if (!uavId || typeof uavId !== 'string') {
    throw new Error('Expected non-empty UAV ID');
  }

  let response;

  try {
    response = await hub.startAsyncOperationForSingleId(uavId, {
      type: 'LOG-INF',
    });
  } catch (error) {
    const errorString = errorToString(error);
    throw new Error(
      `Failed to retrieve log list for UAV ${uavId}: ${errorString}`
    );
  }

  return response;
}

/**
 * Returns the current preflight status of a single UAV.
 */
export async function getPreflightStatus(hub, uavId) {
  if (!uavId || typeof uavId !== 'string') {
    throw new Error('Expected non-empty UAV ID');
  }

  const response = await hub.sendMessage({
    type: 'UAV-PREFLT',
    ids: [uavId],
  });
  if (
    response.body?.type === 'UAV-PREFLT' &&
    response.body.result &&
    response.body.result[uavId]
  ) {
    return response.body.result[uavId];
  }

  throw new Error('Unexpected response for preflight status query');
}

/**
 * Returns the current mapping of services to ports on the server.
 */
export async function getServerPortMapping(hub) {
  const response = await hub.sendMessage({ type: 'SYS-PORTS' });
  return response.body &&
    response.body.type === 'SYS-PORTS' &&
    typeof response.body.ports === 'object'
    ? response.body.ports
    : undefined;
}

/**
 * Returns the configuration of the current drone show managed by the server.
 */
export async function getShowConfiguration(hub) {
  const response = await hub.sendMessage({ type: 'SHOW-CFG' });
  const configuration = get(response, 'body.configuration');
  if (configuration && typeof configuration === 'object') {
    return configuration;
  }

  throw new Error('No show configuration returned');
}

/**
 * Returns the list of loaded extensions and the list of extensions known to
 * the server, in an object with keys named `loaded` and `available`.
 *
 * The response is cached for a short period of time (a few seconds).
 *
 * @param  {MessageHub}  hub  the message hub used to send the message
 */
const listExtensions = memoize(
  async (hub) => {
    const response = await hub.sendMessage('EXT-LIST');
    return response.body;
  },
  {
    maxAge: 5000 /* 5 seconds */,
    promise: true,
  }
);

/**
 * Checks whether the extension with the given name is currently loaded in
 * the server.
 *
 * @param  {MessageHub}  hub  the message hub used to send the message
 * @param  {string}      name  the name of the extension
 *
 * @return {Boolean} whether the extension is loaded
 */
export async function isExtensionLoaded(hub, name) {
  const extensions = await listExtensions(hub);

  if (Array.isArray(get(extensions, 'loaded'))) {
    return extensions.loaded.includes(name);
  }

  return false;
}

/**
 * Query handler object that can be used to initiate queries to a Flockwave
 * server using a given message hub.
 */
export class QueryHandler {
  _queries = {
    adaptShow,
    getBasicBeaconProperties,
    getConfigurationOfExtension,
    getFlightLog,
    getFlightLogList,
    getPreflightStatus,
    getServerPortMapping,
    getShowConfiguration,
    isExtensionLoaded,
    listExtensions,
  };

  /**
   * Constructor.
   *
   * @param {MessageHub} hub  the message hub to use for communication
   */
  constructor(hub) {
    for (const [name, func] of Object.entries(this._queries)) {
      this[name] = (...args) => func(hub, ...args);
    }
  }
}

// TODO: Replace with the following (or something better)
//       when moving to TypeScript:
// export type ConstructedQueryHandler = Record<
//   keyof QueryHandler['_queries'],
//   (...args: any[]) => Promise<any>
// >;
/**
 * @typedef {{
 *   [Q in keyof QueryHandler['_queries']]: (...args: any[]) => Promise<any>
 * }} ConstructedQueryHandler
 */

/**
 * @type {new (hub: MessageHub) => ConstructedQueryHandler}
 */
export const ConstructedQueryHandler = QueryHandler;
