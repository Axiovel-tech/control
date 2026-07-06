/**
 * @file Grouping and filtering helpers for the RTLS parameter dialog.
 *
 * Groups are derived client-side from the parameter naming convention: the
 * token before the first underscore is the domain prefix (UWB_CHANNEL and
 * UWB_AN0_X are both UWB; SIM_UWB_DROP_PCT is SIM). The wire protocol has no
 * group metadata, so this is the single source of the taxonomy.
 */

import { getRtlsParamMetadata } from './param-metadata';
import { type RtlsParam } from './types';

/** A group of parameters sharing a name prefix, in display order. */
export type RtlsParamGroup = {
  /** The raw prefix, e.g. 'UWB'. */
  key: string;

  /** Parameters of the group, in the order the device reported them. */
  params: RtlsParam[];
};

/**
 * Human-readable labels for the known group prefixes. Unknown prefixes fall
 * back to the raw prefix itself.
 */
export const GROUP_LABELS: Record<string, string> = {
  UWB: 'UWB ranging',
  POS: 'Positioning',
  ORIGIN: 'Site origin',
  WIFI: 'Wi-Fi',
  MAV: 'MAVLink identity',
  FW: 'Firmware',
  SIM: 'Simulation',
};

/**
 * Display order of the known groups: everyday tuning first, simulation-only
 * knobs last. Prefixes not listed here sort after the known ones,
 * alphabetically.
 */
const GROUP_ORDER = ['UWB', 'POS', 'ORIGIN', 'WIFI', 'MAV', 'FW', 'SIM'];

/**
 * Returns the group prefix of an RTLS parameter name: the token before the
 * first underscore, or the whole name when it has no underscore.
 */
export function getRtlsParamGroup(name: string): string {
  const index = name.indexOf('_');
  return index > 0 ? name.slice(0, index) : name;
}

/** Returns the human-readable label of a group key. */
export function getRtlsParamGroupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}

/**
 * Groups the given parameters by name prefix, in a stable display order:
 * known groups per GROUP_ORDER first, then unknown prefixes alphabetically.
 * Within a group the device-reported parameter order is preserved.
 */
export function groupRtlsParams(params: RtlsParam[]): RtlsParamGroup[] {
  const byKey = new Map<string, RtlsParam[]>();
  for (const param of params) {
    const key = getRtlsParamGroup(param.name);
    const group = byKey.get(key);
    if (group) {
      group.push(param);
    } else {
      byKey.set(key, [param]);
    }
  }

  const keys = [...byKey.keys()].sort((a, b) => {
    const indexA = GROUP_ORDER.indexOf(a);
    const indexB = GROUP_ORDER.indexOf(b);
    if (indexA >= 0 && indexB >= 0) {
      return indexA - indexB;
    }

    if (indexA >= 0 || indexB >= 0) {
      return indexA >= 0 ? -1 : 1;
    }

    return a.localeCompare(b);
  });

  return keys.map((key) => ({ key, params: byKey.get(key)! }));
}

/**
 * Returns whether a parameter matches a free-text filter: case-insensitive
 * substring match on the parameter name and on its static metadata
 * description, if any. An empty or whitespace-only query matches everything.
 */
export function matchesRtlsParamFilter(
  param: RtlsParam,
  query: string
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  if (param.name.toLowerCase().includes(needle)) {
    return true;
  }

  const description = getRtlsParamMetadata(param.name)?.description;
  return description ? description.toLowerCase().includes(needle) : false;
}
