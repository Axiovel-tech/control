import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';
import { Provider } from 'react-redux';

// Thin mocks for the heavy import chains, as in the other RTLS view tests.
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
// a dialog renders into a portal, which a static render leaves out: its
// content is rendered in place instead
jest.mock('@mui/material/Dialog', () => ({
  __esModule: true,
  default: ({
    children,
    open,
  }: {
    children: React.ReactNode;
    open: boolean;
  }) => (open ? <div data-testid='dialog'>{children}</div> : null),
}));

import RtlsVerifyDialog from '~/features/rtls/RtlsVerifyDialog';
import {
  openRtlsVerifyDialog,
  rtlsVerifySucceeded,
} from '~/features/rtls/slice';
import { runFleetVerification } from '~/features/rtls/verify-actions';
import messageHub from '~/message-hub';

import {
  createRtlsTestStore,
  dispatchThunk,
  reply,
  type RtlsTestStore,
} from './rtls-test-store';
import { VERIFY } from './switch-recording';

// eslint-disable-next-line @typescript-eslint/unbound-method -- a jest mock, never called through `this`
const sendMessage = jest.mocked(messageHub.sendMessage);

const render = (store: RtlsTestStore): string =>
  renderToStaticMarkup(
    <Provider store={store}>
      <RtlsVerifyDialog />
    </Provider>
  );

/** The markup of one rule's list item. */
const ruleIn = (markup: string, id: string): string => {
  const start = markup.indexOf(`data-testid="rtls-verify-rule-${id}"`);
  return start < 0 ? '' : markup.slice(start, markup.indexOf('</li>', start));
};

/** A store whose dialog is open on the recorded verification. */
const verified = async (): Promise<RtlsTestStore> => {
  const store = createRtlsTestStore();
  sendMessage.mockResolvedValueOnce(reply(VERIFY));
  await dispatchThunk(store, runFleetVerification());
  store.dispatch(openRtlsVerifyDialog());
  return store;
};

describe('the fleet verification dialog with the survey rules', () => {
  test('asks the server for the rules and holds what it answers', async () => {
    const store = await verified();
    expect(sendMessage).toHaveBeenCalledWith(
      { type: 'X-RTLS-VERIFY', inDepth: false },
      { timeout: 120 }
    );
    expect(
      store.getState().rtls.verify.lastResult?.rules.map(({ id }) => id)
    ).toEqual(['survey', 'frame', 'anchors', 'firmware']);
  });

  test('the rules in the order the server sends them', async () => {
    const markup = render(await verified());
    const order = [...markup.matchAll(/rtls-verify-rule-([a-z]+)"/g)].map(
      (match) => match[1]
    );
    expect(order).toEqual(['survey', 'frame', 'anchors', 'firmware']);
    expect(markup).toContain('StatusPill-status-error');
    expect(markup).toContain('blocked');
  });

  test('"survey" failing is an error, one finding per line', async () => {
    const rule = ruleIn(render(await verified()), 'survey');
    expect(rule).toContain('data-status="fail"');
    expect(rule).toContain('StatusLight-status-error');
    expect(rule).toContain('Anchor survey');
    expect(rule).not.toContain('(warning)');
    const findings = [...rule.matchAll(/<span style="display:block">([^<]*)</g)]
      .map((match) => match[1])
      .map((text) => text.replaceAll('&#x27;', "'"));
    expect(findings).toEqual([
      'RTLS anchor A2 is not surveyed',
      'RTLS anchor A3 is on survey 11, the cell on 12',
      'tag 42 leaves out 2 anchor(s): anchor 203 (no-position), anchor 204 (other-survey)',
      'tag 42 uses 2 of 2 surveyed anchors',
    ]);
  });

  test('"frame" passing is green, with what it found', async () => {
    const rule = ruleIn(render(await verified()), 'frame');
    expect(rule).toContain('data-status="pass"');
    expect(rule).toContain('StatusLight-status-success');
    expect(rule).toContain('the tags of each cell hold one origin and yaw');
  });

  test('"anchors" failing is a warning and says so', async () => {
    const rule = ruleIn(render(await verified()), 'anchors');
    expect(rule).toContain('StatusLight-status-warning');
    expect(rule).toContain('Anchor positions (warning)');
    expect(rule).toContain(
      'RTLS anchor A1 is 12 cm closer to its initiator than when surveyed'
    );
  });

  test('a skipped rule is grey', () => {
    const store = createRtlsTestStore();
    store.dispatch(
      rtlsVerifySucceeded({
        inDepth: false,
        passed: true,
        receivedAt: 0,
        rules: [
          {
            id: 'frame',
            label: 'Cell frame',
            severity: 'error',
            status: 'skipped',
            detail: 'no online tags',
          },
        ],
      })
    );
    store.dispatch(openRtlsVerifyDialog());
    expect(ruleIn(render(store), 'frame')).toContain('StatusLight-status-off');
  });

  test('nothing of a geometry verdict is read or shown', async () => {
    const store = createRtlsTestStore();
    sendMessage.mockResolvedValueOnce(
      reply({ ...VERIFY, geometry: { consistent: true, devices: {} } })
    );
    await dispatchThunk(store, runFleetVerification());
    store.dispatch(openRtlsVerifyDialog());
    expect(store.getState().rtls.verify.lastResult).not.toHaveProperty(
      'geometry'
    );
    expect(render(store)).not.toMatch(/geometry/i);
  });
});
