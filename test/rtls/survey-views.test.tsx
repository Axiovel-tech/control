import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

// No i18next instance is initialized under jest (see the `~/i18n` stub):
// translation lookups echo the key, followed by their values so the test can
// see what was interpolated.
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

import {
  type RtlsSurveyControls,
  surveyControls,
} from '~/features/rtls/survey';
import {
  mapRtlsSurvey,
  type RtlsSurvey,
} from '~/features/rtls/survey-messages';
import {
  EMPTY_SKETCH,
  type RtlsSurveyAnchor,
  standardCellSketch,
} from '~/features/rtls/survey-sketch';
import SurveyCommit from '~/views/rtls/survey/SurveyCommit';
import SurveyGate from '~/views/rtls/survey/SurveyGate';
import SurveyPlan from '~/views/rtls/survey/SurveyPlan';
import SurveyResult from '~/views/rtls/survey/SurveyResult';
import SurveyRun from '~/views/rtls/survey/SurveyRun';

import {
  COMMIT,
  COMMIT_INCOMPLETE,
  type RecordedMessage,
  RUN,
  RUN_BLOCKED,
  RUN_FAILED,
} from './survey-recording';

/** The state object of a recorded message, mapped as the app maps it. */
const surveyIn = (message: RecordedMessage): RtlsSurvey => {
  const survey = mapRtlsSurvey(message.body.survey);
  if (survey === undefined) {
    throw new Error('the recording carries no survey here');
  }
  return survey;
};

const READY = surveyIn(RUN[5]);
const BLOCKED = surveyIn(RUN_BLOCKED[1]);

const ANCHORS: RtlsSurveyAnchor[] = [0, 1, 2, 3].map((slot) => ({
  id: String(101 + slot),
  name: `RTLS anchor A${slot}`,
  slot,
}));

/** A3 for 104, as the mocked `t` renders the slot label. */
const nameOf = (id: string): string => `A${Number(id) - 101}`;

const noop = (): void => undefined;

const count = (markup: string, needle: string): number =>
  markup.split(needle).length - 1;

describe('the commit gate', () => {
  const render = (survey: RtlsSurvey, acknowledged = false): string =>
    renderToStaticMarkup(
      <SurveyGate
        gate={survey.gate}
        nameOf={nameOf}
        acknowledged={acknowledged}
        onAcknowledge={noop}
      />
    );

  test('a clean fit shows no gate', () => {
    expect(render({ ...READY, gate: { blocked: [], warnings: [] } })).toBe('');
  });

  test('warnings come with exactly one acknowledgement box', () => {
    const markup = render(READY);
    expect(markup).toContain('data-testid="rtls-survey-warnings"');
    expect(markup).toContain('MuiAlert-colorWarning');
    // the pair is named by its anchors, the text is the server's
    expect(markup).toContain(
      'rtlsSurvey.gate.pairEntry(a=A1,b=A2,detail=valid share 0.84 of the ranges 102 measured while 103 initiated)'
    );
    expect(count(markup, 'type="checkbox"')).toBe(1);
    expect(markup).toContain('rtlsSurvey.gate.acknowledge');
    expect(markup).not.toContain('checked=""');
    expect(render(READY, true)).toContain('checked=""');
    expect(markup).not.toContain('rtls-survey-blocked');
  });

  test('blocks are red and offer nothing to dismiss or acknowledge', () => {
    const markup = render(BLOCKED);
    expect(markup).toContain('data-testid="rtls-survey-blocked"');
    expect(markup).toContain('MuiAlert-colorError');
    expect(markup).toContain('data-code="pair-missing"');
    expect(markup).toContain(
      'rtlsSurvey.gate.pairEntry(a=A2,b=A3,detail=no usable range between 103 and 104)'
    );
    expect(markup).toContain(
      'rtlsSurvey.gate.entry(anchor=A3,detail=the ranges leave 104 undetermined)'
    );
    expect(markup).not.toContain('type="checkbox"');
    expect(markup).not.toContain('<button');
  });

  test('several warnings still share the one box', () => {
    const warning = READY.gate.warnings[0];
    const markup = render({
      ...READY,
      gate: {
        blocked: BLOCKED.gate.blocked,
        warnings: [
          warning,
          { code: 'rms', detail: 'fit rms 0.061 m' },
          { ...warning, code: 'asymmetry' },
        ],
      },
    });
    expect(count(markup, 'type="checkbox"')).toBe(1);
    // a warning about the cell names no anchor
    expect(markup).toContain('<li data-code="rms">');
    expect(markup).toContain('fit rms 0.061 m');
    expect(markup).toContain('rtls-survey-blocked');
  });
});

describe('the result', () => {
  const markup = renderToStaticMarkup(
    <SurveyResult survey={READY} nameOf={nameOf} />
  );

  test("the fit's rms, worst pair and the server's notes", () => {
    expect(markup).toContain('rtlsSurvey.result.summary(rms=3.1,worst=7.4)');
    expect(markup).toContain('rtlsSurvey.result.planar');
    expect(markup).toContain(
      'anchors 103 and 104 are swapped against the placement'
    );
  });

  test("each anchor's quality; no move for one that stored no position", () => {
    const row = (id: string): string =>
      markup.slice(
        markup.indexOf(`data-testid="rtls-survey-fit-${id}"`),
        markup.indexOf('</tr>', markup.indexOf(`rtls-survey-fit-${id}`))
      );
    const cells = (id: string): string[] =>
      [...row(id).matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((match) => match[1]);
    // name, x, y, z, links, rms, worst pair, sigma, moved
    expect(cells('103')).toEqual([
      'A2',
      '0.00',
      '3.00',
      '0.00',
      '3',
      '2.1',
      '7.4',
      '3.1',
      '15.4',
    ]);
    expect(cells('104').at(-1)).toBe('—');
  });

  test('the pair table is coloured by residual, the worst pair first', () => {
    const levels = [...markup.matchAll(/data-level="(\w+)"/g)].map(
      (match) => match[1]
    );
    expect(levels).toEqual(['warning', 'ok', 'ok', 'ok', 'ok', 'ok']);
    expect(markup.indexOf('rtlsSurvey.pair(a=A1,b=A2)')).toBeLessThan(
      markup.indexOf('rtlsSurvey.pair(a=A0,b=A1)')
    );
    // both directions' valid shares
    expect(markup).toContain('rtlsSurvey.result.shares(ab=98,ba=84)');
  });

  test('an anchor the ranges leave undetermined shows no uncertainty', () => {
    const blocked = renderToStaticMarkup(
      <SurveyResult survey={BLOCKED} nameOf={nameOf} />
    );
    const row = blocked.slice(blocked.indexOf('rtls-survey-fit-104'));
    expect(row.slice(0, row.indexOf('</tr>'))).toContain('>2</td>');
    expect([
      ...row.slice(0, row.indexOf('</tr>')).matchAll(/>—<\/td>/g),
    ]).toHaveLength(2);
  });

  test('nothing without a fit', () => {
    expect(
      renderToStaticMarkup(
        <SurveyResult survey={surveyIn(RUN[1])} nameOf={nameOf} />
      )
    ).toBe('');
  });
});

describe('the run', () => {
  const controlsFor = (
    survey: RtlsSurvey | undefined,
    refusalKey?: string
  ): RtlsSurveyControls =>
    surveyControls({ survey, acknowledged: false, refusalKey });

  const render = (
    survey: RtlsSurvey | undefined,
    extra: Partial<React.ComponentProps<typeof SurveyRun>> = {}
  ): string =>
    renderToStaticMarkup(
      <SurveyRun
        survey={survey}
        controls={controlsFor(survey)}
        hintKeys={[]}
        sketchChanged={false}
        nameOf={nameOf}
        onStart={noop}
        onCancel={noop}
        onRefit={noop}
        {...extra}
      />
    );

  const button = (markup: string, id: string): string => {
    const start = markup.indexOf(`data-testid="${id}"`);
    return start < 0
      ? ''
      : markup.slice(
          markup.lastIndexOf('<button', start),
          markup.indexOf('>', start)
        );
  };

  test('measuring: the step, who initiates, and Cancel', () => {
    const markup = render(surveyIn(RUN[2]));
    expect(markup).toContain('rtlsSurvey.run.step(step=3,steps=4,anchor=A2)');
    expect(markup).toContain('aria-valuenow="50"');
    expect(button(markup, 'rtls-survey-cancel')).not.toContain('disabled');
    expect(button(markup, 'rtls-survey-start')).toContain('disabled');
    expect(markup).toContain('rtlsSurvey.refusal.running');
    expect(markup).not.toContain('rtls-survey-refit');
  });

  test('returning: no Cancel', () => {
    const markup = render(surveyIn(RUN[4]));
    expect(markup).toContain('rtlsSurvey.run.returning');
    expect(markup).not.toContain('rtls-survey-cancel');
  });

  test('ready: Survey again and Refit; a changed sketch says so', () => {
    const markup = render(READY);
    expect(markup).toContain('rtlsSurvey.run.startAgain');
    expect(button(markup, 'rtls-survey-refit')).not.toContain('disabled');
    expect(markup).not.toContain('rtlsSurvey.run.sketchChanged');
    expect(render(READY, { sketchChanged: true })).toContain(
      'rtlsSurvey.run.sketchChanged'
    );
  });

  test('disabled with the reason shown', () => {
    const markup = render(READY, {
      controls: controlsFor(READY, 'rtlsCellSettings.disarmFirst'),
    });
    expect(button(markup, 'rtls-survey-start')).toContain('disabled');
    expect(markup).toContain('data-testid="rtls-survey-start-blocked"');
    expect(markup).toContain('rtlsCellSettings.disarmFirst');
  });

  test("failed: the server's reason", () => {
    const markup = render(surveyIn(RUN_FAILED[3]));
    expect(markup).toContain('data-testid="rtls-survey-failed"');
    expect(markup).toContain('RTLS anchor A2 refused the survey step: locked');
    expect(button(markup, 'rtls-survey-start')).not.toContain('disabled');
  });

  test("a refusal shows the server's reason; an effect shows nothing", () => {
    const refused = render(undefined, {
      outcome: {
        action: 'start',
        result: 'refused',
        reason: 'RTLS anchor A3 is asleep; wake it first',
      },
    });
    expect(refused).toContain('data-result="refused"');
    expect(refused).toContain('RTLS anchor A3 is asleep; wake it first');
    expect(
      render(READY, { outcome: { action: 'fit', result: 'fitted' } })
    ).not.toContain('rtls-survey-outcome');
    // without a reason the result is put in words
    expect(
      render(READY, { outcome: { action: 'commit', result: 'blocked' } })
    ).toContain('rtlsSurvey.outcome.blocked');
  });

  test('hints about the sketch are listed', () => {
    expect(
      render(undefined, { hintKeys: ['rtlsSurvey.hint.partialSketch'] })
    ).toContain('rtlsSurvey.hint.partialSketch');
  });
});

describe('the commit', () => {
  const render = (
    survey: RtlsSurvey,
    options: {
      acknowledged?: boolean;
      refusalKey?: string;
      locked?: boolean;
    } = {}
  ): string =>
    renderToStaticMarkup(
      <SurveyCommit
        survey={survey}
        controls={surveyControls({
          survey,
          acknowledged: options.acknowledged ?? false,
          refusalKey: options.refusalKey,
        })}
        locked={options.locked ?? false}
        nameOf={nameOf}
        onCommit={noop}
        onLock={noop}
      />
    );

  const commitButton = (markup: string): string => {
    const start = markup.indexOf('data-testid="rtls-survey-commit"');
    return markup.slice(
      markup.lastIndexOf('<button', start),
      markup.indexOf('</button>', start)
    );
  };

  test('waits for the acknowledgement, with the reason shown', () => {
    const waiting = render(READY);
    expect(commitButton(waiting)).toContain('disabled');
    expect(commitButton(waiting)).toContain('rtlsSurvey.commit.action');
    expect(waiting).toContain('rtlsSurvey.commit.acknowledgeFirst');

    const open = render(READY, { acknowledged: true });
    expect(commitButton(open)).not.toContain('disabled');
    expect(open).not.toContain('rtls-survey-commit-blocked');
  });

  test('disabled by the guard and by a block, each with its reason', () => {
    const guarded = render(READY, {
      acknowledged: true,
      refusalKey: 'rtlsCellSettings.unlockFirst',
    });
    expect(commitButton(guarded)).toContain('disabled');
    expect(guarded).toContain('rtlsCellSettings.unlockFirst');

    const blocked = render(BLOCKED, { acknowledged: true });
    expect(commitButton(blocked)).toContain('disabled');
    expect(blocked).toContain('rtlsSurvey.commit.blocked');
  });

  test('incomplete: the anchors left behind, per-anchor results, and Retry', () => {
    const markup = render(surveyIn(COMMIT_INCOMPLETE), { acknowledged: true });
    expect(commitButton(markup)).toContain('rtlsSurvey.commit.retry');
    expect(commitButton(markup)).not.toContain('disabled');
    expect(markup).toContain('rtlsSurvey.commit.incomplete(anchors=A3)');
    expect(markup).toContain('rtlsSurvey.commit.surveyId(id=12)');
    expect(markup).toContain(
      'rtlsSurvey.commit.result(anchor=A3,written=rtlsSurvey.commit.written.failed) rtlsSurvey.commit.detail(detail=no answer)'
    );
    // the three that took it already run the new ID; the fourth does not
    expect(count(markup, 'rtlsSurvey.commit.running')).toBe(3);
    expect(count(markup, 'data-written="failed"')).toBe(1);
  });

  test('committing: no button, the anchors that already run the new ID', () => {
    const markup = render(surveyIn(COMMIT[1]));
    expect(markup).not.toContain('data-testid="rtls-survey-commit"');
    expect(count(markup, 'rtlsSurvey.commit.running')).toBe(2);
  });

  test('committed: the way to the lock, until the anchors are locked', () => {
    const markup = render(surveyIn(COMMIT[2]));
    expect(markup).toContain('data-testid="rtls-survey-committed"');
    expect(markup).toContain('data-testid="rtls-survey-lock"');
    expect(markup).not.toContain('data-testid="rtls-survey-commit"');
    expect(count(markup, 'rtlsSurvey.commit.running')).toBe(4);
    expect(render(surveyIn(COMMIT[2]), { locked: true })).not.toContain(
      'rtls-survey-lock'
    );
  });
});

describe('the plan', () => {
  const render = (
    props: Partial<React.ComponentProps<typeof SurveyPlan>> = {}
  ): string =>
    renderToStaticMarkup(
      <SurveyPlan
        anchors={ANCHORS}
        sketch={standardCellSketch(ANCHORS)}
        nameOf={nameOf}
        onMove={noop}
        {...props}
      />
    );

  test('every online anchor is a marker, named by its slot', () => {
    const markup = render();
    for (const { id } of ANCHORS) {
      expect(markup).toContain(`data-testid="rtls-survey-anchor-${id}"`);
    }
    expect(markup).toContain('>A3</text>');
    expect(markup).toContain('data-testid="rtls-survey-axis"');
    expect(markup).not.toContain('rtls-survey-fitted');
  });

  test('an anchor that was never placed is drawn to be dragged', () => {
    const markup = render({ sketch: EMPTY_SKETCH });
    expect(count(markup, 'data-known="false"')).toBe(4);
    expect(markup).not.toContain('rtls-survey-axis');
  });

  test('the initiating anchor is ringed while measuring only', () => {
    const measuring = render({ survey: surveyIn(RUN[1]) });
    const ring = measuring.indexOf('rtls-survey-initiator');
    expect(ring).toBeGreaterThan(
      measuring.indexOf('data-testid="rtls-survey-anchor-102"')
    );
    expect(ring).toBeLessThan(
      measuring.indexOf('data-testid="rtls-survey-anchor-103"')
    );
    // the last initiator of a finished run is no longer one
    expect(render({ survey: { ...READY, initiator: '104' } })).not.toContain(
      'rtls-survey-initiator'
    );
  });

  test("the fit is drawn over the sketch with each anchor's move", () => {
    const markup = render({ survey: READY });
    for (const { id } of ANCHORS) {
      expect(markup).toContain(`data-testid="rtls-survey-fitted-${id}"`);
    }
    expect(markup).toContain('rtlsSurvey.plan.moved(anchor=A2,cm=15.4)');
    // no stored position: no move to show
    expect(markup).not.toContain('rtlsSurvey.plan.moved(anchor=A3');
  });

  test('nothing to draw without anchors', () => {
    expect(render({ anchors: [], sketch: EMPTY_SKETCH })).toBe('');
  });
});
