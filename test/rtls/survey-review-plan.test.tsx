import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

// Thin mocks for the heavy import chains, as in survey-panel.test.tsx.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/features/snackbar/actions', () => ({
  __esModule: true,
  showError: jest.fn(),
  showNotification: jest.fn(),
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));
jest.mock('~/features/show/selectors', () => ({
  __esModule: true,
  isShowAuthorizedToStartLocally: (state: {
    show: { start: { authorized: boolean } };
  }): boolean => state.show.start.authorized,
}));
jest.mock('~/features/servers/selectors', () => ({
  __esModule: true,
  isConnected: (): boolean => false,
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>): string =>
      values === undefined
        ? key
        : `${key}(${Object.entries(values)
            .map(([name, value]) => `${name}=${String(value)}`)
            .join(',')})`,
  }),
}));

import { surveyControls } from '~/features/rtls/survey';
import { PLAN_AS_FRAME } from '~/features/rtls/survey-frame';
import { mapRtlsSurvey } from '~/features/rtls/survey-messages';
import {
  EMPTY_SKETCH,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withGroupAdded,
} from '~/features/rtls/survey-sketch';
import SurveyAnchorList from '~/views/rtls/survey/SurveyAnchorList';
import SurveyElevation from '~/views/rtls/survey/SurveyElevation';
import SurveyPlan from '~/views/rtls/survey/SurveyPlan';
import SurveyRun from '~/views/rtls/survey/SurveyRun';

import { READY } from './survey-recording';

const noop = (): void => undefined;

/** A3 for 104, as the mocked `t` renders the slot label. */
const nameOf = (id: string): string => `A${Number(id) - 101}`;

/** Eight anchors in the slots of two tiers. */
const EIGHT: RtlsSurveyAnchor[] = [0, 1, 2, 3, 4, 5, 6, 7].map((slot) => ({
  id: String(101 + slot),
  name: `RTLS anchor A${slot}`,
  slot,
}));

const READY_SURVEY = mapRtlsSurvey(READY)!; // non-null: a recorded state

/** The opening tag of the element with the given test id. */
const tagOf = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="${id}"`);
  return start < 0
    ? ''
    : markup.slice(markup.lastIndexOf('<', start), markup.indexOf('>', start));
};

/** The texts of the SVG labels in the given markup. */
const labels = (markup: string): string[] =>
  [...markup.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);

describe('3. the choices in plain words', () => {
  const english = JSON.parse(
    readFileSync(path.resolve(__dirname, '../../src/i18n/en.json'), 'utf8')
  ).rtlsSurvey as Record<string, Record<string, string>>;

  test('"+x" reads "+x (y = 0)"', () => {
    expect(english.list.xAxis).toBe('+x (y = 0)');
    expect(english.list.xAxisMeans).toMatch(/direction of the X axis/);
  });

  test('the origin is the point (0, 0), and its group is height 0', () => {
    expect(english.list.originMeans).toMatch(/\(0, 0\)/);
    expect(english.list.originMeans).toMatch(/height 0/);
  });

  test('a height group is "about the same height", never "the same height"', () => {
    expect(english.list.groupMeans).toBe('about the same height');
    const texts = Object.values(english)
      .flatMap((entry) =>
        typeof entry === 'string' ? [entry] : Object.values(entry)
      )
      .filter((text) => /same height/.test(text));
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      expect(text).toMatch(/about the same height/);
    }
  });

  test('the four choices are explained where they are made', () => {
    const explained = english.list.explained;
    expect(explained).toMatch(/Origin: this anchor is the point \(0, 0\)/);
    expect(explained).toMatch(
      /fixes the direction of the X axis and nothing else/
    );
    expect(explained).toMatch(/what makes the frame level/);
    expect(explained).toMatch(/every group after the origin's is above it/);
  });

  test('each column says under its head what the choice does', () => {
    const markup = renderToStaticMarkup(
      <SurveyAnchorList
        anchors={EIGHT}
        sketch={standardCellSketch(EIGHT)}
        leftOut={[]}
        restored={false}
        onChange={noop}
      />
    );
    for (const key of [
      'rtlsSurvey.list.groupMeans',
      'rtlsSurvey.list.originMeans',
      'rtlsSurvey.list.xAxis',
      'rtlsSurvey.list.xAxisMeans',
      'rtlsSurvey.list.explained',
    ]) {
      expect(markup).toContain(key);
    }
    // the heads come before the rows they explain
    expect(markup.indexOf('rtlsSurvey.list.originMeans')).toBeLessThan(
      markup.indexOf('data-testid="rtls-survey-row-101"')
    );
  });
});

describe('1. and 11. the anchor list', () => {
  const render = (
    sketch: RtlsSurveySketch,
    extra: Partial<React.ComponentProps<typeof SurveyAnchorList>> = {}
  ): string =>
    renderToStaticMarkup(
      <SurveyAnchorList
        anchors={EIGHT}
        sketch={sketch}
        leftOut={[]}
        restored={false}
        onChange={noop}
        {...extra}
      />
    );

  test('every group the operator added can be removed, with who is in it', () => {
    const sketch = withAnchorGroup(
      withGroupAdded(standardCellSketch(EIGHT), 'Truss'),
      '108',
      2
    );
    const markup = render(sketch);
    expect(markup).toContain('data-testid="rtls-survey-group-2"');
    expect(markup).toContain('rtlsSurvey.group.members(group=Truss,count=1)');
    // the chip carries its remove control
    const chip = markup.slice(
      markup.indexOf('data-testid="rtls-survey-group-2"')
    );
    expect(chip.slice(0, chip.indexOf('</div>'))).toContain(
      'data-testid="CancelIcon"'
    );
  });

  test('Lower and Upper have none', () => {
    const markup = render(standardCellSketch(EIGHT));
    expect(markup).not.toContain('rtls-survey-group-');
    expect(markup).not.toContain('data-testid="CancelIcon"');
  });

  test('a group taken from the echo is numbered', () => {
    const markup = render({
      ...EMPTY_SKETCH,
      groups: [''],
      groupOf: { '108': 2 },
    });
    expect(markup).toContain(
      'rtlsSurvey.group.members(group=rtlsSurvey.group.numbered(number=3),count=1)'
    );
  });

  test('an operating anchor left out says so on its row', () => {
    const sketch = withAnchorIncluded(standardCellSketch(EIGHT), '107', false);
    const markup = render(sketch, { leftOut: ['107'] });
    expect(markup).toContain('data-testid="rtls-survey-left-out-107"');
    expect(markup).toContain('rtlsSurvey.list.leftOut');
    expect(markup).not.toContain('rtls-survey-left-out-106');
    // one that may stay out (asleep, in standby) has nothing to say
    expect(render(sketch)).not.toContain('rtls-survey-left-out');
  });

  test('a frame taken from the server says where it is from', () => {
    expect(render(EMPTY_SKETCH, { restored: true })).toContain(
      'data-testid="rtls-survey-restored"'
    );
    expect(render(EMPTY_SKETCH)).not.toContain('rtls-survey-restored');
  });
});

describe('11. the reason at the Survey button', () => {
  test('names the anchors to include', () => {
    const markup = renderToStaticMarkup(
      <SurveyRun
        controls={surveyControls({
          acknowledged: false,
          startProblemKey: 'rtlsSurvey.problem.leftOut',
        })}
        leftOut={['107', '108']}
        hintKeys={[]}
        sketchChanged={false}
        nameOf={nameOf}
        onStart={noop}
        onCancel={noop}
        onRefit={noop}
      />
    );
    expect(markup).toContain(
      'rtlsSurvey.problem.leftOut(count=2,anchors=A6, A7)'
    );
    expect(tagOf(markup, 'rtls-survey-start')).toContain('disabled');
  });
});

describe('4. a top view that tells the tiers apart', () => {
  const render = (
    props: Partial<React.ComponentProps<typeof SurveyPlan>> = {}
  ): string =>
    renderToStaticMarkup(
      <SurveyPlan
        anchors={EIGHT}
        sketch={standardCellSketch(EIGHT)}
        nameOf={nameOf}
        fitTransformOf={() => PLAN_AS_FRAME}
        onMove={noop}
        {...props}
      />
    );

  /** Where a marker's own circle is drawn: the last circle of its group. */
  const centreOf = (markup: string, id: string): string => {
    const start = markup.indexOf(`data-testid="rtls-survey-anchor-${id}"`);
    const group = markup.slice(start, markup.indexOf('</g>', start));
    const circle = [
      ...group.matchAll(/<circle cx="([^"]*)" cy="([^"]*)" r="([^"]*)"/g),
    ].at(-1);
    return `${circle?.[1]},${circle?.[2]}`;
  };
  const radiusOf = (markup: string, id: string): number => {
    const start = markup.indexOf(`data-testid="rtls-survey-anchor-${id}"`);
    const group = markup.slice(start, markup.indexOf('</g>', start));
    return Number([...group.matchAll(/ r="([^"]*)"/g)].at(-1)?.[1]);
  };
  /** Where the label of an anchor is written. */
  const labelAt = (markup: string, name: string): string => {
    const match = new RegExp(
      `<text x="([^"]*)" y="([^"]*)"[^>]*>${name}</text>`
    ).exec(markup);
    return `${match?.[1]},${match?.[2]}`;
  };

  test('an upper anchor stands on the same spot as the one under it', () => {
    const markup = render();
    expect(centreOf(markup, '105')).toBe(centreOf(markup, '101'));
  });

  test('but is a ring around its dot, with its label in another corner', () => {
    const markup = render();
    expect(tagOf(markup, 'rtls-survey-anchor-101')).toContain('data-tier="0"');
    expect(tagOf(markup, 'rtls-survey-anchor-105')).toContain('data-tier="1"');
    expect(radiusOf(markup, '105')).toBeGreaterThan(radiusOf(markup, '101'));
    expect(labelAt(markup, 'A4')).not.toBe(labelAt(markup, 'A0'));
    // no two labels of the cell are written on one spot
    const spots = EIGHT.map(({ id }) => labelAt(markup, nameOf(id)));
    expect(new Set(spots).size).toBe(EIGHT.length);
  });

  test('the X and the Y axis are drawn from the chosen anchors', () => {
    const markup = render();
    expect(markup).toContain('data-testid="rtls-survey-axis-x"');
    expect(markup).toContain('data-testid="rtls-survey-axis-y"');
    expect(labels(markup)).toEqual(
      expect.arrayContaining([
        'rtlsSurvey.plan.x',
        'rtlsSurvey.plan.y',
        'rtlsSurvey.plan.origin',
      ])
    );
    expect(render({ sketch: EMPTY_SKETCH })).not.toContain('rtls-survey-axis');
  });

  test('with the fit drawn, each anchor is named once', () => {
    const four = EIGHT.slice(0, 4);
    const markup = render({
      anchors: four,
      sketch: standardCellSketch(four),
      survey: READY_SURVEY,
    });
    const names = labels(markup).filter((text) => /A\d/.test(text));
    expect(names).toHaveLength(4);
    expect(markup).toContain('data-testid="rtls-survey-fitted-104"');
  });

  test('a committed fit is where the markers are: nothing is drawn over them', () => {
    const four = EIGHT.slice(0, 4);
    const markup = render({
      anchors: four,
      sketch: EMPTY_SKETCH,
      survey: { ...READY_SURVEY, state: 'committed' },
    });
    expect(markup).not.toContain('rtls-survey-fitted');
    // nobody stores a position yet: the markers are where the fit put them
    expect(markup.split('data-known="true"')).toHaveLength(5);
  });
});

describe('4. the side view', () => {
  const entries = (heights?: [number, number]) =>
    EIGHT.map(({ id, slot = 0 }) => ({
      id,
      point: { north: slot % 2 === 1 ? 11 : 0, east: slot % 4 >= 2 ? 11 : 0 },
      heightM: heights?.[slot >= 4 ? 1 : 0],
    }));
  const render = (heights?: [number, number]): string =>
    renderToStaticMarkup(
      <SurveyElevation
        entries={entries(heights)}
        sketch={standardCellSketch(EIGHT)}
        nameOf={nameOf}
      />
    );

  test('before a fit: the groups as steps, by name', () => {
    const markup = render();
    expect(tagOf(markup, 'rtls-survey-elevation')).toContain(
      'data-metric="false"'
    );
    expect(labels(markup)).toEqual([
      'rtlsSurvey.group.lower',
      'rtlsSurvey.group.upper',
      'A0, A1',
      'A2, A3',
      'A4, A5',
      'A6, A7',
    ]);
  });

  test('with heights: each group with its height', () => {
    const markup = render([0, 4.5]);
    expect(tagOf(markup, 'rtls-survey-elevation')).toContain(
      'data-metric="true"'
    );
    expect(labels(markup).slice(0, 2)).toEqual([
      'rtlsSurvey.elevation.group(group=rtlsSurvey.group.lower,height=0.00)',
      'rtlsSurvey.elevation.group(group=rtlsSurvey.group.upper,height=4.50)',
    ]);
  });

  test('the upper row is drawn above the lower one', () => {
    const markup = render();
    const rowY = (index: number): number =>
      Number(
        new RegExp(
          `rtls-survey-elevation-row-${index}"><line[^>]* y1="([^"]*)"`
        ).exec(markup)?.[1]
      );
    expect(rowY(1)).toBeLessThan(rowY(0));
  });

  test('nothing without anchors', () => {
    expect(
      renderToStaticMarkup(
        <SurveyElevation entries={[]} sketch={EMPTY_SKETCH} nameOf={nameOf} />
      )
    ).toBe('');
  });
});
