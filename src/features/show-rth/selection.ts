import type { ShowRTHTarget } from '~/flockwave/operations';

export type ShowRTHSelection = {
  /**
   * Whether every drone of the show returns. Overrides `selected`.
   */
  returnAll: boolean;

  /**
   * The drones that return when `returnAll` is off.
   */
  selected: string[];
};

export type ShowRTHRow = {
  id: string;

  /**
   * Whether the drone holds a certified RTH plan. Drones without one cannot
   * be sent home along a certified path; they keep flying the show.
   */
  hasPlan: boolean;
};

/**
 * Lists the drones of the dialog: the drones of the mission first, in mission
 * order, then any other drone that holds a plan.
 */
export function getShowRTHRows(
  missionUAVIds: readonly string[],
  planHolders: readonly string[]
): ShowRTHRow[] {
  const holders = new Set(planHolders);
  const ids = [...new Set([...missionUAVIds, ...planHolders])];
  return ids.map((id) => ({ id, hasPlan: holders.has(id) }));
}

/**
 * Chooses what the dialog starts with, following the mode of the control
 * panel: in broadcast mode, or without a selection, every drone returns;
 * otherwise the selected drones that hold a plan.
 */
export function getInitialShowRTHSelection({
  broadcast,
  planHolders,
  selectedUAVIds,
}: {
  broadcast: boolean;
  planHolders: readonly string[];
  selectedUAVIds: readonly string[];
}): ShowRTHSelection {
  const holders = new Set(planHolders);
  const selected = selectedUAVIds.filter((id) => holders.has(id));
  return {
    returnAll: broadcast || selected.length === 0,
    selected,
  };
}

/**
 * Adds the given drone to the selection or removes it.
 */
export function toggleShowRTHSelection(
  selected: readonly string[],
  id: string
): string[] {
  return selected.includes(id)
    ? selected.filter((other) => other !== id)
    : [...selected, id];
}

/**
 * Turns the dialog state into the request target, or `undefined` if nothing
 * would be sent.
 */
export function getShowRTHTarget({
  returnAll,
  selected,
}: ShowRTHSelection): ShowRTHTarget | undefined {
  if (returnAll) {
    return { all: true };
  }

  return selected.length > 0 ? { ids: [...selected] } : undefined;
}
