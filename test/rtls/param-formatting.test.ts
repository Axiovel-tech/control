import { describe, expect, test } from '@jest/globals';

import {
  coerceParamValue,
  formatParamValue,
  isIntegerParamType,
} from '~/features/rtls/param-formatting';

describe('rtls param-formatting', () => {
  describe('type predicates', () => {
    test('isIntegerParamType', () => {
      expect(isIntegerParamType('int32')).toBe(true);
      expect(isIntegerParamType('uint8')).toBe(true);
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
});
