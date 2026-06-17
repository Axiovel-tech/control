import { describe, expect, test } from '@jest/globals';

import {
  coerceParamValue,
  formatParamValue,
  formatRtlsParameters,
  isIntegerParamType,
  isNumericParamType,
  parseRtlsParameters,
} from '~/features/rtls/param-formatting';

describe('rtls param-formatting', () => {
  describe('type predicates', () => {
    test('isNumericParamType', () => {
      expect(isNumericParamType('uint8')).toBe(true);
      expect(isNumericParamType('real64')).toBe(true);
      expect(isNumericParamType('custom')).toBe(false);
    });

    test('isIntegerParamType', () => {
      expect(isIntegerParamType('int32')).toBe(true);
      expect(isIntegerParamType('real32')).toBe(false);
      expect(isIntegerParamType('real64')).toBe(false);
      expect(isIntegerParamType('custom')).toBe(false);
    });
  });

  describe('coerceParamValue', () => {
    test('parses integer types as integers', () => {
      expect(coerceParamValue('42', 'uint16')).toBe(42);
      expect(coerceParamValue('-7', 'int8')).toBe(-7);
      // Integer parse truncates fractional input.
      expect(coerceParamValue('3.9', 'uint32')).toBe(3);
    });

    test('parses real types as floats', () => {
      expect(coerceParamValue('3.14', 'real32')).toBeCloseTo(3.14);
      expect(coerceParamValue('-0.5', 'real64')).toBeCloseTo(-0.5);
    });

    test('passes custom values through as strings', () => {
      expect(coerceParamValue('hello, world', 'custom')).toBe('hello, world');
    });

    test('throws on a non-numeric value for numeric types', () => {
      expect(() => coerceParamValue('abc', 'uint8')).toThrow();
      expect(() => coerceParamValue('', 'real32')).toThrow();
    });
  });

  describe('formatParamValue', () => {
    test('stringifies numbers and customs', () => {
      expect(formatParamValue(42, 'uint16')).toBe('42');
      expect(formatParamValue(3.5, 'real32')).toBe('3.5');
      expect(formatParamValue('text', 'custom')).toBe('text');
    });
  });

  describe('round-trip formatting', () => {
    test('formats with and without a device id', () => {
      const text = formatRtlsParameters([
        { name: 'GAIN', deviceId: undefined, value: '5' },
        { name: 'MODE', deviceId: '7', value: 'auto' },
      ]);
      expect(text).toBe('GAIN=5\n7=MODE=auto\n');
    });

    test('parses both line formats', () => {
      const parsed = parseRtlsParameters('GAIN=5\n7=MODE=auto\n');
      expect(parsed).toEqual([
        { name: 'GAIN', deviceId: undefined, value: '5' },
        { name: 'MODE', deviceId: '7', value: 'auto' },
      ]);
    });

    test('parse → format → parse is stable', () => {
      const original = 'A=1\n3=B=2\n';
      const parsed = parseRtlsParameters(original);
      expect(formatRtlsParameters(parsed)).toBe(original);
    });

    test('accepts commas as separators', () => {
      expect(parseRtlsParameters('A,1')).toEqual([
        { name: 'A', deviceId: undefined, value: '1' },
      ]);
      expect(parseRtlsParameters('3,B,2')).toEqual([
        { name: 'B', deviceId: '3', value: '2' },
      ]);
    });

    test('skips blank and comment lines', () => {
      const parsed = parseRtlsParameters('# header\nA=1\n\n// note\nB=2');
      expect(parsed).toEqual([
        { name: 'A', deviceId: undefined, value: '1' },
        { name: 'B', deviceId: undefined, value: '2' },
      ]);
    });

    test('throws on a line without a separator', () => {
      expect(() => parseRtlsParameters('NOPE')).toThrow(/Line 1/);
    });

    test('throws on a value-only line', () => {
      expect(() => parseRtlsParameters('=5')).toThrow(/Line 1/);
    });
  });
});
