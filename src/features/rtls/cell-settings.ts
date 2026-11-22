/**
 * @file The cell settings as Control sees them: the server's `cellSettings`
 * (derived from every device's stored parameters and the `cellcfg` code it
 * runs) and the X-RTLS-CELL request. What must match across a cell, and why
 * a change needs a reboot, is the firmware's: see rtls-link-zephyr
 * `docs/reference/uwb-ranging.md`, "Cell settings".
 */

import type MessageHub from '~/flockwave/messages';
import { type Message, type MessageBody } from '~/flockwave/types';

/** The ranging-rate presets the server applies (Hz). */
export const RTLS_RATE_PRESETS = [33, 50, 83] as const;

/** The anchors' TX gain index range: 0 is the strongest level. */
export const RTLS_TX_GAIN_MIN = 0;
export const RTLS_TX_GAIN_MAX = 127;
export const RTLS_TX_GAIN_DEFAULT = 47;

/** A device's state against A0's settings. */
export type RtlsCellState = 'ok' | 'differ' | 'restart' | 'unknown';

/** The cell's settings, as A0 stores them, and who does not run them. */
export type RtlsCellSettings = {
  /** The preset of A0's block; `undefined` for any other block. */
  rateHz?: number;
  blockMs?: number;
  txGain?: number;
  /** A0's system id; `undefined` while no initiator is online. */
  reference?: string;
  differ: string[];
  restart: string[];
  unknown: string[];
};

type AnyRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const toIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id) => toNumber(id) !== undefined).map(String)
    : [];

const CELL_STATES: readonly RtlsCellState[] = [
  'ok',
  'differ',
  'restart',
  'unknown',
];

/** A device entry's `cellSettings`; `undefined` when absent or unknown. */
export const mapCellState = (value: unknown): RtlsCellState | undefined =>
  CELL_STATES.find((state) => state === value);

/**
 * Maps the server's `cellSettings`; `undefined` for a server without them,
 * whose clients show no cell-settings UI.
 */
export function mapCellSettings(value: unknown): RtlsCellSettings | undefined {
  if (!isRecord(value) || !Array.isArray(value.differ)) {
    return undefined;
  }
  const reference = toNumber(value.reference);
  return {
    rateHz: toNumber(value.rateHz),
    blockMs: toNumber(value.blockMs),
    txGain: toNumber(value.txGain),
    reference: reference === undefined ? undefined : String(reference),
    differ: toIds(value.differ),
    restart: toIds(value.restart),
    unknown: toIds(value.unknown),
  };
}

/** A device the apply did not write or restart. */
export type RtlsCellFailure = { id: string; detail: string };

/** Outcome of an X-RTLS-CELL request. */
export type RtlsCellResult = {
  result: 'status' | 'applied' | 'incomplete' | 'refused' | 'unknown';
  /** Why the server refuses (or would refuse) an apply. */
  reason?: string;
  settings?: RtlsCellSettings;
  failures: RtlsCellFailure[];
};

const CELL_RESULTS = ['status', 'applied', 'incomplete', 'refused'] as const;

/** The devices whose entry carries a `detail`: a failed write or restart. */
const mapFailures = (value: unknown): RtlsCellFailure[] =>
  isRecord(value)
    ? Object.entries(value).flatMap(([id, entry]) => {
        const detail = isRecord(entry) ? toText(entry.detail) : undefined;
        return detail === undefined ? [] : [{ id, detail }];
      })
    : [];

/**
 * Queries or applies the cell settings (X-RTLS-CELL). Only a NAK (an invalid
 * request, a server without the feature) rejects, with its reason.
 */
export async function sendRtlsCell(
  hub: MessageHub,
  action: 'status' | 'apply',
  target: { rateHz?: number; txGain?: number } = {}
): Promise<RtlsCellResult> {
  const response: Message<MessageBody & AnyRecord> = await hub.sendMessage({
    type: 'X-RTLS-CELL',
    action,
    ...target,
  });
  const body = response.body;
  if (body?.type !== 'X-RTLS-CELL') {
    throw new Error(
      toText(body?.reason) ??
        `Unexpected response to X-RTLS-CELL (${String(body?.type)})`
    );
  }
  return {
    result: CELL_RESULTS.find((value) => value === body.result) ?? 'unknown',
    reason: toText(body.reason),
    settings: mapCellSettings(body.cellSettings),
    failures: mapFailures(body.results),
  };
}
