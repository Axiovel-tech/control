import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

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

import { setRtlsSurveySketch, surveyControls } from '~/features/rtls/survey';
import { commitRtlsSurvey } from '~/features/rtls/survey-actions';
import {
  mapRtlsSurvey,
  type RtlsSurvey,
} from '~/features/rtls/survey-messages';
import { standardCellSketch } from '~/features/rtls/survey-sketch';
import messageHub from '~/message-hub';
import RtlsSurveyPanel from '~/views/rtls/RtlsSurveyPanel';
import {
  centimetres,
  metres,
  signedCentimetres,
} from '~/views/rtls/survey/labels';
import SurveyCommit from '~/views/rtls/survey/SurveyCommit';
import SurveyGate from '~/views/rtls/survey/SurveyGate';
import SurveyRun from '~/views/rtls/survey/SurveyRun';
import SurveyStored from '~/views/rtls/survey/SurveyStored';

import { reply } from './rtls-test-store';
import {
  COMMIT,
  push,
  READY,
  REFIT,
  RUN,
  RUN_CANCELLED,
} from './survey-recording';
import {
  acknowledge,
  CELL,
  createSurveyTestStore,
  FOUR_ANCHORS,
  play,
  reportAnchors,
  run,
  stateOf,
  type SurveyTestStore,
} from './survey-test-store';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

const noop = (): void => undefined;

/** A3 for 104, as the mocked `t` renders the slot label. */
const nameOf = (id: string): string => `A${Number(id) - 101}`;

const READY_SURVEY = mapRtlsSurvey(READY)!; // non-null: a recorded state

/** The opening tag of the element with the given test id. */
const tagOf = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="${id}"`);
  return start < 0
    ? ''
    : markup.slice(markup.lastIndexOf('<', start), markup.indexOf('>', start));
};

const renderPanel = (store: SurveyTestStore): string =>
  renderToStaticMarkup(
    <Provider store={store}>
      <RtlsSurveyPanel />
    </Provider>
  );

/** A store whose cell was laid out with "Standard cell". */
const withStandardCell = (): SurveyTestStore => {
  const store = createSurveyTestStore();
  store.dispatch(
    setRtlsSurveySketch({
      cell: CELL,
      sketch: standardCellSketch(
        FOUR_ANCHORS.map(({ id, slot }) => ({
          id: String(id),
          name: `RTLS anchor A${slot}`,
          slot,
        }))
      ),
    })
  );
  return store;
};

describe('5. and 6. what is pressed and what answers it stay at the top', () => {
  const ready = (): SurveyTestStore => {
    const store = withStandardCell();
    play(store, RUN);
    return store;
  };

  /** The markup of the part of the panel that never scrolls away. */
  const headerOf = (markup: string): string =>
    markup.slice(
      markup.indexOf('data-testid="rtls-survey-header"'),
      markup.indexOf('data-testid="rtls-survey-body"')
    );

  test('Survey, the step counter and Cancel are in the header', () => {
    const store = withStandardCell();
    play(store, RUN.slice(0, 3));
    const header = headerOf(renderPanel(store));
    expect(header).toContain('data-testid="rtls-survey-start"');
    expect(header).toContain('data-testid="rtls-survey-cancel"');
    expect(header).toContain(
      'rtlsSurvey.run.step(step=3,steps=4,anchor=rtlsAnchor.role.slot(slot=2))'
    );
    expect(header).not.toContain('rtls-survey-row-');
  });

  test('so are the fit, the gate and Commit; the tables are below', () => {
    const markup = renderPanel(ready());
    const header = headerOf(markup);
    expect(header).toContain('data-testid="rtls-survey-summary"');
    expect(header).toContain('data-testid="rtls-survey-warnings"');
    expect(header).toContain('data-testid="rtls-survey-commit"');
    expect(header).not.toContain('rtls-survey-pairs');
    expect(header).not.toContain('rtls-survey-anchors-fit');
    // the anchor list, then the fit's tables, with the pairs last
    const order = [
      'rtls-survey-commit"',
      'rtls-survey-plan"',
      'rtls-survey-row-101"',
      'rtls-survey-anchors-fit"',
      'rtls-survey-pairs-toggle"',
    ].map((id) => markup.indexOf(id));
    expect(order.every((at) => at > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('a gate that passes is shown as passing, beside Commit', () => {
    const store = withStandardCell();
    play(store, [...RUN, REFIT]);
    const header = headerOf(renderPanel(store));
    expect(header).toContain('data-testid="rtls-survey-gate-clear"');
    expect(header).toContain('rtlsSurvey.gate.clear');
    expect(tagOf(header, 'rtls-survey-commit')).not.toContain('disabled');
  });

  test('a block is in the header too, where it cannot be missed', () => {
    const store = withStandardCell();
    play(store, [
      push({
        ...READY,
        gate: {
          blocked: [
            {
              code: 'pair-missing',
              device: 103,
              peer: 104,
              detail: 'no usable range',
            },
          ],
          warnings: [],
        },
      }),
    ]);
    const header = headerOf(renderPanel(store));
    expect(header).toContain('data-testid="rtls-survey-blocked"');
    expect(tagOf(header, 'rtls-survey-commit')).toContain('disabled');
  });

  test('the page is laid out wide until it is measured narrow', () => {
    expect(tagOf(renderPanel(ready()), 'rtls-survey-panel')).toContain(
      'data-layout="wide"'
    );
  });
});

describe('7. the lock is offered after the commit, under its results', () => {
  const committed = async (): Promise<SurveyTestStore> => {
    const store = withStandardCell();
    play(store, RUN);
    acknowledge(store);
    sendMessage.mockResolvedValueOnce(reply(COMMIT[2].body));
    await run(store, commitRtlsSurvey(CELL));
    return store;
  };

  test('no dialog opens over what each anchor answered', async () => {
    const store = await committed();
    expect(stateOf(store).rtls.lockDialogOpen).toBe(false);
    const markup = renderPanel(store);
    const results = markup.indexOf('data-testid="rtls-survey-commit-results"');
    const offer = markup.indexOf('data-testid="rtls-survey-lock"');
    expect(results).toBeGreaterThan(0);
    expect(offer).toBeGreaterThan(results);
    expect(markup.split('rtlsSurvey.commit.running')).toHaveLength(5);
    // the fit passed its gate when it was committed: nothing is left to pass
    expect(markup).not.toContain('rtls-survey-gate-clear');
    expect(markup).toContain('data-testid="rtls-survey-summary"');
  });

  test('the offer is a button of its own, and goes once the anchors are locked', () => {
    const render = (locked: boolean): string =>
      renderToStaticMarkup(
        <SurveyCommit
          survey={{ ...READY_SURVEY, state: 'committed' }}
          controls={surveyControls({ acknowledged: false })}
          offline={[]}
          locked={locked}
          nameOf={nameOf}
          onCommit={noop}
          onLock={noop}
        />
      );
    expect(tagOf(render(false), 'rtls-survey-lock')).toContain(
      'MuiButton-contained'
    );
    expect(render(false)).toContain('rtlsSurvey.commit.committed');
    expect(render(true)).not.toContain('rtls-survey-lock');
    expect(render(true)).toContain('rtlsSurvey.commit.committedLocked');
  });
});

describe('8. in a second browser', () => {
  test('the held survey shows its frame and can be refitted', () => {
    const store = createSurveyTestStore();
    reportAnchors(
      store,
      FOUR_ANCHORS.map(({ id, slot }) => ({ id, slot }))
    );
    play(store, [
      push({
        ...READY,
        frame: {
          origin: 101,
          xAxis: 102,
          heightGroups: [[101, 102, 103, 104]],
          upper: [],
          yPositive: 103,
        },
      }),
    ]);
    const markup = renderPanel(store);
    expect(markup).toContain('data-testid="rtls-survey-restored"');
    expect(markup).not.toContain('rtlsSurvey.problem.pickOrigin');
    expect(tagOf(markup, 'rtls-survey-refit')).not.toContain('disabled');
    expect(tagOf(markup, 'rtls-survey-start')).not.toContain('disabled');
    expect(markup).toContain('data-testid="rtls-survey-axis-x"');
  });
});

describe('9. after a cancelled re-survey', () => {
  test('the page still shows what the anchors store', () => {
    const store = createSurveyTestStore();
    play(store, RUN_CANCELLED);
    const markup = renderPanel(store);
    expect(markup).toContain('data-testid="rtls-survey-ended"');
    expect(markup).toContain('data-testid="rtls-survey-stored"');
    expect(markup).toContain('data-testid="rtls-survey-stored-101"');
    expect(markup).not.toContain('rtls-survey-result');
  });

  test('the stored positions with the survey they are from', () => {
    const markup = renderToStaticMarkup(
      <SurveyStored
        anchors={[
          {
            id: '102',
            name: 'RTLS anchor A1',
            slot: 1,
            stored: { north: 10.998, east: -0.001 },
            storedDown: -4.499,
            surveyId: 12,
          },
        ]}
        nameOf={nameOf}
      />
    );
    const cells = [...markup.matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map(
      (match) => match[1]
    );
    expect(cells).toEqual(['A1', '11.00', '0.00', '-4.50', '12']);
    expect(
      renderToStaticMarkup(<SurveyStored anchors={[]} nameOf={nameOf} />)
    ).toBe('');
  });
});

describe('10. the small things', () => {
  test('a length that rounds to zero is written without a sign', () => {
    expect(metres(-0.004)).toBe('0.00');
    expect(metres(-0.006)).toBe('-0.01');
    expect(metres(0)).toBe('0.00');
    expect(centimetres(-0.0004)).toBe('0.0');
    expect(centimetres(-0.0006)).toBe('-0.1');
    expect(metres(undefined)).toBe('—');
  });

  test('an offset carries its sign, zero none', () => {
    expect(signedCentimetres(0.012)).toBe('+1.2');
    expect(signedCentimetres(-0.012)).toBe('-1.2');
    expect(signedCentimetres(0.0004)).toBe('0.0');
    expect(signedCentimetres(-0.0004)).toBe('0.0');
    expect(signedCentimetres(undefined)).toBe('—');
  });

  const run_ = (
    survey: RtlsSurvey,
    extra: Partial<React.ComponentProps<typeof SurveyRun>>
  ): string =>
    renderToStaticMarkup(
      <SurveyRun
        survey={survey}
        controls={surveyControls({ survey, acknowledged: false })}
        leftOut={[]}
        hintKeys={[]}
        sketchChanged={false}
        nameOf={nameOf}
        onStart={noop}
        onCancel={noop}
        onRefit={noop}
        {...extra}
      />
    );

  test('a refit whose result is unchanged says so', () => {
    const same = run_(READY_SURVEY, {
      outcome: { action: 'fit', result: 'fitted', unchanged: true },
    });
    expect(same).toContain('data-testid="rtls-survey-refitted"');
    expect(same).toContain('rtlsSurvey.run.refitUnchanged');
    const moved = run_(READY_SURVEY, {
      outcome: { action: 'fit', result: 'fitted', unchanged: false },
    });
    expect(moved).toContain('rtlsSurvey.run.refitChanged');
  });

  test('and no longer once the sketch moved on, or without a refit', () => {
    expect(
      run_(READY_SURVEY, {
        outcome: { action: 'fit', result: 'fitted', unchanged: true },
        sketchChanged: true,
      })
    ).not.toContain('rtls-survey-refitted');
    expect(
      run_(READY_SURVEY, { outcome: { action: 'start', result: 'started' } })
    ).not.toContain('rtls-survey-refitted');
  });

  test('a committed fit is past its gate', () => {
    const gate = (survey: RtlsSurvey): string =>
      renderToStaticMarkup(
        <SurveyGate
          survey={survey}
          nameOf={nameOf}
          acknowledged={false}
          onAcknowledge={noop}
        />
      );
    const clear = { ...READY_SURVEY, gate: { blocked: [], warnings: [] } };
    expect(gate(clear)).toContain('rtls-survey-gate-clear');
    expect(gate({ ...clear, state: 'committed' })).not.toContain(
      'rtls-survey-gate-clear'
    );
  });
});
