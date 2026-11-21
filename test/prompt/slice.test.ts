import { describe, expect, test } from '@jest/globals';

import reducer, { _showPromptDialog } from '~/features/prompt/slice';
import { PromptDialogType } from '~/features/prompt/types';

describe('prompt dialog', () => {
  test('a new dialog does not inherit the previous one’s options', () => {
    let state = reducer(
      undefined,
      _showPromptDialog({
        type: PromptDialogType.CONFIRMATION,
        message: 'Drones lose positioning while anchors sleep.',
        title: 'Sleep anchors?',
        submitButtonLabel: 'Sleep',
      })
    );
    expect(state.title).toBe('Sleep anchors?');

    state = reducer(
      state,
      _showPromptDialog({
        type: PromptDialogType.CONFIRMATION,
        message: 'Unlock the anchors?',
      })
    );
    expect(state).toMatchObject({
      open: true,
      message: 'Unlock the anchors?',
      title: undefined,
      submitButtonLabel: undefined,
    });
  });
});
