import type { Dispatch } from '@reduxjs/toolkit';

import { parseFirmwareJob } from './messages';
import { firmwareJobUpdated } from './slice';

export const handleFirmwareUpdateMessage = (
  body: Record<string, unknown> | undefined,
  dispatch: Dispatch
): void => {
  const job = parseFirmwareJob(body?.job);
  if (job) {
    dispatch(firmwareJobUpdated(job));
  }
};
