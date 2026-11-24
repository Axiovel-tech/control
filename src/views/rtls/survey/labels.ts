/**
 * @file How the survey page names anchors and writes lengths.
 */

import type { TFunction } from 'i18next';

import { type RtlsSurveyAnchor } from '~/features/rtls/survey-sketch';

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

/** A length in metres, two decimals; a dash while unknown. */
export const metres = (value: number | undefined): string =>
  value === undefined ? '—' : value.toFixed(2);

/** A length in centimetres, one decimal; a dash while unknown. */
export const centimetres = (value: number | undefined): string =>
  value === undefined ? '—' : (value * 100).toFixed(1);
