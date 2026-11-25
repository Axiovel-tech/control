/**
 * @file How the survey page names anchors and height groups and writes
 * lengths.
 */

import type { TFunction } from 'i18next';

import {
  BUILT_IN_GROUPS,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
} from '~/features/rtls/survey-sketch';

/** Names an anchor by system id: its slot (A3) as on the anchors panel. */
export type AnchorNamer = (id: string) => string;

export const anchorNamer =
  (anchors: readonly RtlsSurveyAnchor[], t: TFunction): AnchorNamer =>
  (id) => {
    const slot = anchors.find((anchor) => anchor.id === id)?.slot;
    return slot === undefined
      ? t('rtlsSurvey.anchor.unknown', { id })
      : t('rtlsAnchor.role.slot', { slot });
  };

/**
 * The names of a sketch's height groups, lowest first: Lower, Upper, then
 * the ones the operator added. A group without a name of its own (taken from
 * the server's echo) is numbered.
 */
export const groupNames = (
  sketch: RtlsSurveySketch,
  t: TFunction
): string[] => [
  t('rtlsSurvey.group.lower'),
  t('rtlsSurvey.group.upper'),
  ...sketch.groups.map(
    (name, index) =>
      name ||
      t('rtlsSurvey.group.numbered', { number: index + BUILT_IN_GROUPS + 1 })
  ),
];

/** Colours per height group, lowest first; later groups reuse the last. */
const GROUP_COLORS = ['#2196f3', '#9c27b0', '#00897b', '#795548'];

export const groupColor = (level: number): string =>
  GROUP_COLORS[Math.min(Math.max(level, 0), GROUP_COLORS.length - 1)];

/** Rounds to `digits` decimals; a value that rounds to zero has no sign. */
const fixed = (value: number, digits: number): string => {
  const factor = 10 ** digits;
  return (Math.round(value * factor) / factor + 0).toFixed(digits);
};

/** A length in metres, two decimals; a dash while unknown. */
export const metres = (value: number | undefined): string =>
  value === undefined ? '—' : fixed(value, 2);

/** A length in centimetres, one decimal; a dash while unknown. */
export const centimetres = (value: number | undefined): string =>
  value === undefined ? '—' : fixed(value * 100, 1);

/** A signed length in centimetres (+1.2, -0.4, 0.0); a dash while unknown. */
export const signedCentimetres = (value: number | undefined): string => {
  const text = centimetres(value);
  return value === undefined || text.startsWith('-') || Number(text) === 0
    ? text
    : `+${text}`;
};
