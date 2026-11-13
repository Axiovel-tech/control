import { describe, expect, test } from '@jest/globals';

import { findAssignmentInDistanceMatrix } from '~/algorithms/matching';

describe('findAssignmentInDistanceMatrix()', () => {
  test('hungarian leaves surplus rows out of the assignment', () => {
    const assignment = findAssignmentInDistanceMatrix([[5], [1], [3]], {
      algorithm: 'hungarian',
    });

    expect(assignment).toEqual([[1, 0]]);
  });

  test('hungarian is optimal when there are more rows than columns', () => {
    const assignment = findAssignmentInDistanceMatrix(
      [
        [5, 2],
        [1, 9],
        [3, 0],
      ],
      { algorithm: 'hungarian' }
    );

    expect(assignment).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });

  test('hungarian leaves surplus columns out of the assignment', () => {
    const assignment = findAssignmentInDistanceMatrix([[5, 1, 3]], {
      algorithm: 'hungarian',
    });

    expect(assignment).toEqual([[0, 1]]);
  });
});
