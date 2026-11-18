import { createSelector } from '@reduxjs/toolkit';

import type { AppSelector, RootState } from '~/store/reducers';

import { hasLowBatteryWarning, type FirmwareUpdateRun } from './types';

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
  loadingTargets,
  readingArtifact,
  running,
  selectedIds,
}: Pick<
  RootState['firmwareUpdate'],
  | 'artifact'
  | 'confirmed'
  | 'loadingTargets'
  | 'readingArtifact'
  | 'running'
  | 'selectedIds'
>): boolean =>
  Boolean(
    artifact &&
    confirmed &&
    !loadingTargets &&
    !readingArtifact &&
    !running &&
    selectedIds.length > 0
  );

/**
 * Returns the selected targets whose low battery the operator has to accept
 * before the server will update them.
 */
export const getLowBatteryTargetIds = ({
  selectedIds,
  targets,
}: Pick<RootState['firmwareUpdate'], 'selectedIds' | 'targets'>): string[] => {
  const low = new Set(
    targets.filter(hasLowBatteryWarning).map((target) => target.id)
  );
  return selectedIds.filter((id) => low.has(id));
};

export const isLowBatteryAcceptanceMissing = (
  state: Pick<
    RootState['firmwareUpdate'],
    'lowBatteryAccepted' | 'selectedIds' | 'targets'
  >
): boolean =>
  !state.lowBatteryAccepted && getLowBatteryTargetIds(state).length > 0;

export const canStartFirmwareUpdate = createSelector(
  getFirmwareUpdateState,
  (state) =>
    isFirmwareUpdateStartable(state) && !isLowBatteryAcceptanceMissing(state)
);

export const isFirmwareUpdateReconciliationNeeded = ({
  running,
  runs,
}: Pick<RootState['firmwareUpdate'], 'running' | 'runs'>): boolean =>
  !running &&
  Object.values(runs).some(
    (run) =>
      run.status === 'indeterminate' ||
      (run.status === 'running' && run.phase !== 'queued')
  );

export const shouldReconcileFirmwareUpdates = createSelector(
  getFirmwareUpdateState,
  isFirmwareUpdateReconciliationNeeded
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
