import { describe, expect, jest, test } from '@jest/globals';
import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// No i18next instance is initialized under jest (see the `~/i18n` stub):
// translation lookups echo the key and the interpolated values.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>): string =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));

import ShowRTHDroneSelection from '~/features/show-rth/ShowRTHDroneSelection';
import ShowRTHOutcomeSummary, {
  formatBranchTime,
} from '~/features/show-rth/ShowRTHOutcomeSummary';

const render = (node: React.ReactNode): string =>
  renderToStaticMarkup(<>{node}</>);

const countMatches = (markup: string, pattern: RegExp): number =>
  markup.match(pattern)?.length ?? 0;

const rows = [
  { id: '01', hasPlan: true },
  { id: '02', hasPlan: true },
  { id: '03', hasPlan: false },
];

describe('ShowRTHDroneSelection', () => {
  test('lists every drone with a checkbox and a return-all switch', () => {
    const markup = render(
      <ShowRTHDroneSelection
        rows={rows}
        selection={{ returnAll: false, selected: ['02'] }}
        onChange={jest.fn()}
      />
    );

    expect(markup).toContain('showRTHDialog.returnAll');
    expect(countMatches(markup, /type="checkbox"/g)).toBe(4); // switch + 3
    expect(markup).toContain('>01<');
    expect(markup).toContain('>02<');
    expect(markup).toContain(
      'showRTHDialog.noPlan {&quot;id&quot;:&quot;03&quot;}'
    );
  });

  test('checks only the selected drones when return all is off', () => {
    const markup = render(
      <ShowRTHDroneSelection
        rows={rows}
        selection={{ returnAll: false, selected: ['02'] }}
        onChange={jest.fn()}
      />
    );

    expect(countMatches(markup, /checked=""/g)).toBe(1);
    // Only the drone without a plan is disabled.
    expect(countMatches(markup, /disabled=""/g)).toBe(1);
  });

  test('return all checks and locks every drone with a plan', () => {
    const markup = render(
      <ShowRTHDroneSelection
        rows={rows}
        selection={{ returnAll: true, selected: [] }}
        onChange={jest.fn()}
      />
    );

    // The switch and the two drones with a plan.
    expect(countMatches(markup, /checked=""/g)).toBe(3);
    // All three drone checkboxes are locked; the switch is not.
    expect(countMatches(markup, /disabled=""/g)).toBe(3);
  });
});

describe('ShowRTHOutcomeSummary', () => {
  test('formats the branch time in seconds', () => {
    expect(formatBranchTime(42_000_000)).toBe('42.0');
    expect(formatBranchTime(7_250_000)).toBe('7.3');
  });

  test('reports when the drones leave the show and who keeps flying', () => {
    const markup = render(
      <ShowRTHOutcomeSummary
        status={{
          state: 'sent',
          branchTimeUs: 42_000_000,
          succeeded: ['01'],
          failures: { '02': 'show RTH signal not implemented yet' },
        }}
      />
    );

    expect(markup).toContain(
      'showRTHDialog.sent {&quot;count&quot;:1,&quot;time&quot;:&quot;42.0&quot;}'
    );
    expect(markup).toContain('showRTHDialog.failures {&quot;count&quot;:1}');
    expect(markup).toContain('show RTH signal not implemented yet');
  });

  test('shows a refusal', () => {
    const markup = render(
      <ShowRTHOutcomeSummary
        status={{
          state: 'error',
          error: 'RTH refused: The show is not running',
        }}
      />
    );

    expect(markup).toContain('RTH refused: The show is not running');
  });

  test('renders nothing before sending', () => {
    expect(render(<ShowRTHOutcomeSummary status={{ state: 'idle' }} />)).toBe(
      ''
    );
  });
});
