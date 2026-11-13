import { describe, expect, test } from '@jest/globals';

import {
  getInitialShowRTHSelection,
  getShowRTHRows,
  getShowRTHTarget,
  toggleShowRTHSelection,
} from '~/features/show-rth/selection';

describe('getShowRTHRows', () => {
  test('lists mission drones first, then other plan holders', () => {
    expect(getShowRTHRows(['03', '01'], ['01', '05', '03'])).toEqual([
      { id: '03', hasPlan: true },
      { id: '01', hasPlan: true },
      { id: '05', hasPlan: true },
    ]);
  });

  test('marks mission drones without a plan', () => {
    expect(getShowRTHRows(['01', '02'], ['01'])).toEqual([
      { id: '01', hasPlan: true },
      { id: '02', hasPlan: false },
    ]);
  });
});

describe('getInitialShowRTHSelection', () => {
  const planHolders = ['01', '02', '03'];

  test('broadcast mode returns all', () => {
    expect(
      getInitialShowRTHSelection({
        broadcast: true,
        planHolders,
        selectedUAVIds: ['01'],
      })
    ).toEqual({ returnAll: true, selected: ['01'] });
  });

  test('selection mode starts from the selected plan holders', () => {
    expect(
      getInitialShowRTHSelection({
        broadcast: false,
        planHolders,
        selectedUAVIds: ['02', '99'],
      })
    ).toEqual({ returnAll: false, selected: ['02'] });
  });

  test('selection mode without a usable selection returns all', () => {
    expect(
      getInitialShowRTHSelection({
        broadcast: false,
        planHolders,
        selectedUAVIds: ['99'],
      })
    ).toEqual({ returnAll: true, selected: [] });
  });
});

describe('toggleShowRTHSelection', () => {
  test('adds and removes a drone', () => {
    expect(toggleShowRTHSelection(['01'], '02')).toEqual(['01', '02']);
    expect(toggleShowRTHSelection(['01', '02'], '01')).toEqual(['02']);
  });
});

describe('getShowRTHTarget', () => {
  test('return all overrides the selection', () => {
    expect(getShowRTHTarget({ returnAll: true, selected: ['01'] })).toEqual({
      all: true,
    });
  });

  test('sends the selected drones', () => {
    expect(
      getShowRTHTarget({ returnAll: false, selected: ['01', '03'] })
    ).toEqual({ ids: ['01', '03'] });
  });

  test('sends nothing without a selection', () => {
    expect(
      getShowRTHTarget({ returnAll: false, selected: [] })
    ).toBeUndefined();
  });
});
