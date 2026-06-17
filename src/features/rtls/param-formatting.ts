/**
 * @file Parsing/formatting helpers for RTLS parameter manifests and for
 * coercing parameter values to/from the wire types used by X-RTLS-PARAM-*.
 *
 * Parameters are represented as `{ name, value, deviceId? }`. The user edits
 * them as text, one per line, in the format `name=value` or
 * `deviceId=name=value`. This mirrors the UAV parameter upload format but uses
 * `deviceId` (a MAVLink system id) in place of `uavId`.
 */

import {
  type RtlsParamType,
  type RtlsParamValue,
} from './types';

export type RtlsParameterData = {
  name: string;
  deviceId: string | undefined;
  value: string;
};

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
 * Returns whether the given parameter type carries a numeric value (as opposed
 * to the `custom` string type).
 */
export function isNumericParamType(type: RtlsParamType): boolean {
  return NUMERIC_PARAM_TYPES.has(type);
}

/**
 * Returns whether the given parameter type is an integer type.
 */
export function isIntegerParamType(type: RtlsParamType): boolean {
  return type !== 'real32' && type !== 'real64' && isNumericParamType(type);
}

/**
 * Formats a parameter value for display, given its declared type.
 */
export function formatParamValue(
  value: RtlsParamValue,
  type: RtlsParamType
): string {
  if (type === 'custom') {
    return String(value);
  }

  if (typeof value === 'number') {
    return String(value);
  }

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

/**
 * Serialises a manifest of parameters to the editable text representation.
 */
export function formatRtlsParameters(parameters: RtlsParameterData[]): string {
  const rows = parameters.map(({ deviceId, name, value }) =>
    deviceId === undefined ? `${name}=${value}` : `${deviceId}=${name}=${value}`
  );
  return rows.length > 0 ? rows.join('\n') + '\n' : '';
}

/**
 * Parses the editable text representation back into an array of parameters.
 *
 * Lines may use `=` or `,` as separators. Blank lines and lines starting with
 * `#` or `//` are ignored.
 */
export function parseRtlsParameters(
  parameterString: string
): RtlsParameterData[] {
  const result: RtlsParameterData[] = [];
  let lineNumber = 0;

  for (let line of (parameterString || '').split('\n')) {
    lineNumber++;

    line = line.trim().replace(',', '=').replace(',', '=');
    if (line.length === 0) {
      continue;
    }

    if (line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex < 0) {
      throw new Error(
        `Line ${lineNumber} does not contain an equals sign (=) or a comma.`
      );
    }

    const secondEqIndex = line.indexOf('=', eqIndex + 1);

    const [deviceId, name, value] =
      secondEqIndex < 0
        ? [
            undefined,
            line.slice(0, eqIndex).trim(),
            line.slice(eqIndex + 1).trim(),
          ]
        : [
            line.slice(0, eqIndex).trim(),
            line.slice(eqIndex + 1, secondEqIndex).trim(),
            line.slice(secondEqIndex + 1).trim(),
          ];

    if (name.length === 0) {
      throw new Error(
        `Line ${lineNumber} contains no parameter name, only a value`
      );
    }

    if (deviceId !== undefined && deviceId.length === 0) {
      throw new Error(`Line ${lineNumber} contains empty device ID`);
    }

    result.push({ name, deviceId, value });
  }

  return result;
}
