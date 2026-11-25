import type { AppSelector } from '~/store/reducers';

import type { ShowRTHDialogState } from './slice';

export const selectShowRTHDialog: AppSelector<ShowRTHDialogState> = (state) =>
  state.dialogs.showRTH;
