import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, jest, test } from '@jest/globals';

// Thin mocks for the heavy import chains of the modules looked into.
jest.mock('~/message-hub', () => ({
  __esModule: true,
  default: { sendMessage: jest.fn() },
}));
jest.mock('~/error-handling', () => ({
  errorToString: (error: unknown): string => String(error),
}));

import * as messages from '~/features/rtls/messages';
import { READ_ONLY_RTLS_PARAMS } from '~/features/rtls/param-actions';
import * as selectors from '~/features/rtls/selectors';
import * as slice from '~/features/rtls/slice';

/**
 * The tags used to fit the anchor geometry themselves, and Control checked
 * that the fleet agreed (X-RTLS-GEOM) and could make every tag fit again
 * (Recalibrate). The anchors own the geometry now: nothing of that feature
 * may be left to reach, and a tag keeps no anchor list or per-anchor bias
 * for Control to show, edit or write.
 */

const SOURCE = path.resolve(__dirname, '../../src');

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const file = path.join(directory, name);
    return statSync(file).isDirectory()
      ? sourceFiles(file)
      : /\.(ts|tsx|js|jsx)$/.test(name)
        ? [file]
        : [];
  });

/** The files under `src` whose text matches, relative to it. */
const filesWith = (pattern: RegExp): string[] =>
  sourceFiles(SOURCE)
    .filter((file) => pattern.test(readFileSync(file, 'utf8')))
    .map((file) => path.relative(SOURCE, file));

describe('the removed fleet geometry feature', () => {
  test('no source file names its message, its strings or its parameters', () => {
    expect(filesWith(/X-RTLS-GEOM/)).toEqual([]);
    expect(filesWith(/rtlsGeometry|rtlsGeometry\./)).toEqual([]);
    expect(filesWith(/UWB_GEOM_(MODE|RECAL)/)).toEqual([]);
    expect(
      filesWith(/geometry(State|Reason|ResidualM|DriftM|DistancesM)/)
    ).toEqual([]);
    expect(filesWith(/recalibrat/i)).toEqual([]);
  });

  test('its modules are gone', () => {
    const rtls = readdirSync(path.join(SOURCE, 'features/rtls'));
    expect(rtls.filter((name) => /geometry/i.test(name))).toEqual([]);
  });

  test('no request, action or selector of it is exported', () => {
    for (const exported of [messages, slice, selectors]) {
      expect(
        Object.keys(exported).filter((name) => /geom/i.test(name))
      ).toEqual([]);
    }
  });

  test('its strings are gone from the resources', () => {
    const resources = readdirSync(path.join(SOURCE, 'i18n')).filter((name) =>
      name.endsWith('.json')
    );
    for (const name of resources) {
      const text = readFileSync(path.join(SOURCE, 'i18n', name), 'utf8');
      expect(text).not.toMatch(/rtlsGeometry/);
    }
  });

  test('the tags panel has neither its check nor Recalibrate', () => {
    const panel = readFileSync(
      path.join(SOURCE, 'views/rtls/RtlsRolePanel.tsx'),
      'utf8'
    );
    expect(panel).not.toMatch(/check-geometry|recalibrate-geometry/);
    expect(panel).toContain('rtls-tags-panel.verify');
  });
});

describe('a tag keeps no anchor list', () => {
  test('no source file writes or names a per-anchor bias', () => {
    expect(filesWith(/BIAS_M/)).toEqual([]);
  });

  test("an anchor's table is named only as an anchor's own", () => {
    // the one place that knows the parameter names describes them, for the
    // parameter list of an anchor
    expect(filesWith(/UWB_AN(_COUNT|\d|\(|\[|\{)/)).toEqual([
      'features/rtls/param-metadata.ts',
    ]);
  });

  test('what the survey writes cannot be edited by hand', () => {
    expect(READ_ONLY_RTLS_PARAMS.UWB_LOC).toBe('rtlsParams.surveyReadOnly');
    expect(READ_ONLY_RTLS_PARAMS.UWB_SURVEY).toBe('rtlsParams.surveyReadOnly');
  });
});
