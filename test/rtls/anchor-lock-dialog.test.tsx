import { describe, expect, jest, test } from '@jest/globals';
import { renderToStaticMarkup } from 'react-dom/server';

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

import {
  LOCK_DIALOG_OPENED,
  type LockDialogAction,
  lockDialogReducer,
  type LockDialogState,
  runsResurveyCheck,
} from '~/features/rtls/anchor-lock-dialog';
import RtlsAnchorLockDialogView from '~/features/rtls/RtlsAnchorLockDialogView';

const after = (...actions: LockDialogAction[]): LockDialogState =>
  actions.reduce(lockDialogReducer, LOCK_DIALOG_OPENED);

const render = (state: LockDialogState): string =>
  renderToStaticMarkup(
    <RtlsAnchorLockDialogView
      open
      state={state}
      onClose={() => undefined}
      onLock={() => undefined}
      onResurvey={() => undefined}
      onAcknowledge={() => undefined}
    />
  );

/** The opening tag of the element with this test id. */
const tag = (markup: string, id: string): string => {
  const at = markup.indexOf(`data-testid="${id}"`);
  return at < 0 ? '' : markup.slice(markup.lastIndexOf('<', at), at);
};

/** Whether the element with this test id, or the input it wraps, is disabled. */
const disabled = (markup: string, id: string): boolean => {
  const at = markup.indexOf(`data-testid="${id}"`);
  const end = markup.indexOf('>', at);
  return /\bdisabled\b/.test(markup.slice(markup.lastIndexOf('<', at), end));
};

const WARNED: LockDialogAction = {
  type: 'answered',
  outcome: {
    result: 'warnings',
    warnings: ['RTLS anchor A2 is 12 cm off its surveyed position'],
    failures: [],
    resurveyRan: true,
  },
};

describe('the lock dialog with the resurvey check', () => {
  test('measures with the first lock only, and cannot be closed meanwhile', () => {
    const ticked = after({ type: 'resurvey', checked: true });
    expect(runsResurveyCheck(ticked)).toBe(true);

    const measuring = lockDialogReducer(ticked, { type: 'sent' });
    expect(measuring).toMatchObject({ busy: true, measuring: true });
    let markup = render(measuring);
    expect(tag(markup, 'rtls-lock-measuring')).not.toBe('');
    expect(disabled(markup, 'rtls-lock-cancel')).toBe(true);
    expect(disabled(markup, 'rtls-lock-confirm')).toBe(true);

    const warned = lockDialogReducer(measuring, WARNED);
    expect(warned).toMatchObject({ busy: false, measuring: false });
    markup = render(warned);
    expect(tag(markup, 'rtls-lock-measuring')).toBe('');
    expect(markup).toContain(
      'RTLS anchor A2 is 12 cm off its surveyed position'
    );
    expect(disabled(markup, 'rtls-lock-cancel')).toBe(false);
    expect(disabled(markup, 'rtls-lock-resurvey')).toBe(true);
    // Lock anyway waits for the acknowledgement, and does not measure again
    expect(disabled(markup, 'rtls-lock-confirm')).toBe(true);
    const acknowledged = lockDialogReducer(warned, {
      type: 'acknowledged',
      checked: true,
    });
    expect(disabled(render(acknowledged), 'rtls-lock-confirm')).toBe(false);
    expect(runsResurveyCheck(acknowledged)).toBe(false);
    expect(lockDialogReducer(acknowledged, { type: 'sent' })).toMatchObject({
      busy: true,
      measuring: false,
    });
  });

  test('a lock without the check does not measure', () => {
    const sent = after({ type: 'sent' });
    expect(sent).toMatchObject({ busy: true, measuring: false });
    expect(disabled(render(sent), 'rtls-lock-cancel')).toBe(false);
  });

  test('a refusal or a failure shows, and the next open starts afresh', () => {
    const refused = after(
      { type: 'resurvey', checked: true },
      { type: 'sent' },
      { type: 'answered', failure: 'no answer' }
    );
    expect(refused).toMatchObject({ measuring: false, error: 'no answer' });
    expect(lockDialogReducer(refused, { type: 'opened' })).toBe(
      LOCK_DIALOG_OPENED
    );
  });
});
