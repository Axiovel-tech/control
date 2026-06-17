/**
 * @file Helpers for coercing RTLS parameter values to/from the wire types used
 * by X-RTLS-PARAM-*.
 *
 * Numeric parameters are carried on the wire as JSON numbers; `custom`
 * parameters as strings. The user edits a single value as text in the parameter
 * dialog; these helpers convert between that text and the wire value.
 */

import { type RtlsParamType, type RtlsParamValue } from './types';

const NUMERIC_PARAM_TYPES: ReadonlySet<RtlsParamType> = new Set([
  'uint8',
  'int8',
  'uint16',
  'int16',
  'uint32',
  'int32',
  'uint64',
  'int64',
  'real32',
  'real64',
]);

/**
 * Returns whether the given parameter type is an integer type.
 */
export function isIntegerParamType(type: RtlsParamType): boolean {
  return type !== 'real32' && type !== 'real64' && NUMERIC_PARAM_TYPES.has(type);
}

/**
 * Formats a parameter value for display, given its declared type.
 */
export function formatParamValue(
  value: RtlsParamValue,
  _type: RtlsParamType
): string {
  return String(value);
}

/**
 * Coerces a user-entered string value into the JSON value expected on the wire
 * for the given parameter type. Numeric types yield numbers, `custom` yields a
 * string. Throws a descriptive error if a numeric value cannot be parsed.
 */
export function coerceParamValue(
  raw: string,
  type: RtlsParamType
): RtlsParamValue {
  if (type === 'custom') {
    return raw;
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new Error('Empty numeric value');
  }

  const parsed = isIntegerParamType(type)
    ? Number.parseInt(trimmed, 10)
    : Number.parseFloat(trimmed);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Value "${raw}" is not a valid ${type} number`);
  }

  return parsed;
}
