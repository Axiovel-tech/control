/**
 * @file Display text of the anchor lock's breaks: the server's text (it names
 * the anchor) prefixed with the time; a warning's text is shown as it is.
 */

import { type useTranslation } from 'react-i18next';

import { type RtlsLockBreak } from './anchor-lock';

type T = ReturnType<typeof useTranslation>['t'];

/**
 * The breaks newest first (the server appends them): when an anchor flaps,
 * the latest event is the one the alarm just rang for.
 */
export const newestBreaksFirst = (
  breaks: readonly RtlsLockBreak[]
): RtlsLockBreak[] => [...breaks].reverse();
/** A lock break, e.g. `14:02:11 · RTLS anchor A3 rebooted`. */
export const describeLockBreak = (t: T, entry: RtlsLockBreak): string => {
  return entry.time === undefined
    ? entry.text
    : t('rtlsAnchorLock.break', {
        time: new Date(entry.time).toLocaleTimeString(),
        text: entry.text,
      });
};
