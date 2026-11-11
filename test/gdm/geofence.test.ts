import { describe, expect, test } from '@jest/globals';

import { compareWithGdmGeofence } from '~/features/show/gdm/geofence';

const gdmGeofence = {
  polygon: [
    [-5, -5],
    [5, -5],
    [5, 5],
    [-5, 5],
  ] as Array<[number, number]>,
  floor_m: 0,
  ceiling_m: 4,
};

const square = (half: number): Array<[number, number]> => [
  [-half, -half],
  [half, -half],
  [half, half],
  [-half, half],
];

describe('compareWithGdmGeofence', () => {
  test('accepts a Control geofence inside the .gdm one', () => {
    expect(compareWithGdmGeofence(gdmGeofence, square(4), 3.5)).toBeUndefined();
  });

  test('says nothing when the .gdm has no geofence', () => {
    expect(compareWithGdmGeofence(undefined, square(40), 100)).toBeUndefined();
    expect(compareWithGdmGeofence(undefined, undefined, 100)).toBeUndefined();
  });

  test('warns when Control uploads no polygon', () => {
    expect(compareWithGdmGeofence(gdmGeofence, undefined, 3)).toEqual({
      reason: 'noPolygon',
    });
  });

  test('warns when Control allows drones outside the .gdm geofence', () => {
    expect(compareWithGdmGeofence(gdmGeofence, square(6), 3)).toEqual({
      reason: 'outside',
    });
  });

  test('warns when Control allows drones above the .gdm ceiling', () => {
    expect(compareWithGdmGeofence(gdmGeofence, square(4), 6)).toEqual({
      reason: 'ceiling',
      maxAltitude: 6,
      ceiling: 4,
    });
  });
});
