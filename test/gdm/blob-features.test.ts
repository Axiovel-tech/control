import { describe, expect, jest, test } from '@jest/globals';

// `~/message-hub` pulls in the entire application store; stub it (same
// approach as in parameters-upload.test.ts).
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: {
    query: {
      addCollectiveRTH: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      adaptShow: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
    },
  },
}));

jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string =>
    error instanceof Error ? error.message : String(error),
}));

// The configurator's own selectors pull in the map layers and the server
// slice; the tested path stops before using them
jest.mock('~/features/show-configurator/selectors', () => ({
  __esModule: true,
  getHomePositions: jest.fn(),
  selectCoordinateSystem: jest.fn(),
}));

// ESM-only package that the jest transform skips; the tested paths never wait
jest.mock('delay', () => ({ __esModule: true, default: jest.fn() }));

import { addCollectiveRTH } from '~/features/collective-rth/actions';
import { adaptShow } from '~/features/show-configurator/actions';
import messageHub from '~/message-hub';

// A .gdm show sets no base64Blob: these features send the .skyc file itself
// to the server, so they must stop before calling it
const gdmState = {
  show: { base64Blob: undefined },
  mission: { homePositions: [] },
} as never;
const getState = () => gdmState;

describe('features that need the .skyc file', () => {
  test('collective RTH refuses a .gdm show without calling the server', async () => {
    const dispatch = jest.fn();
    // AppThunk is typed as returning void, but this one is async
    const done: unknown = addCollectiveRTH()(dispatch, getState, undefined);
    await done;

    expect(messageHub.query.addCollectiveRTH).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { state: 'error', error: 'show.gdm.requiresSkyc' },
      })
    );
  });

  test('the show configurator refuses a .gdm show without calling the server', async () => {
    const dispatch = jest.fn();
    const done: unknown = adaptShow({} as never, { type: 'default' } as never)(
      dispatch,
      getState,
      undefined
    );
    await done;

    expect(messageHub.query.adaptShow).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { error: 'show.gdm.requiresSkyc' },
      })
    );
  });
});
