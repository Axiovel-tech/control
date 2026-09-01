import { createSelector } from '@reduxjs/toolkit';

import type { AppSelector, RootState } from '~/store/reducers';

import type { FirmwareUpdateRun } from './types';

export const isFirmwareUpdateDialogOpen: AppSelector<boolean> = (state) =>
  state.firmwareUpdate.dialogOpen;

export const getFirmwareUpdateState = (state: RootState) =>
  state.firmwareUpdate;

export const getCompatibleFirmwareTargets = createSelector(
  getFirmwareUpdateState,
  ({ targets }) => targets.filter((target) => target.compatible)
);

export const getSelectedFirmwareTargets = createSelector(
  getFirmwareUpdateState,
  ({ selectedIds, targets }) => {
    const selected = new Set(selectedIds);
    return targets.filter((target) => selected.has(target.id));
  }
);

export const getOrderedFirmwareRuns = createSelector(
  getFirmwareUpdateState,
  ({ order, runs }): FirmwareUpdateRun[] =>
    order.map((id) => runs[id]).filter((run): run is FirmwareUpdateRun => !!run)
);

export const getCurrentFirmwareRun = createSelector(
  getFirmwareUpdateState,
  ({ currentId, runs }) => (currentId ? runs[currentId] : undefined)
);

export const isFirmwareUpdateStartable = ({
  artifact,
  confirmed,
  running,
  selectedIds,
}: Pick<
  RootState['firmwareUpdate'],
  'artifact' | 'confirmed' | 'running' | 'selectedIds'
>): boolean =>
  Boolean(artifact && confirmed && !running && selectedIds.length > 0);

export const canStartFirmwareUpdate = createSelector(
  getFirmwareUpdateState,
  isFirmwareUpdateStartable
);

export const isFirmwareRunCancellable = (
  run: FirmwareUpdateRun | undefined
): boolean =>
  Boolean(
    run?.status === 'running' &&
    run.operationId &&
    run.cancellable &&
    !run.committed
  );

export const canCancelCurrentFirmwareUpdate = createSelector(
  getCurrentFirmwareRun,
  isFirmwareRunCancellable
);
