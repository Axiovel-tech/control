/**
 * @file Narrowing of the untyped values in the server's RTLS messages.
 */

export type AnyRecord = Record<string, unknown>;

export const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const toText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const toNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
