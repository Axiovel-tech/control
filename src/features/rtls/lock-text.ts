/**
 * @file Display text of the anchor lock's warnings and breaks: the server's
 * own text (it names the anchor), prefixed with the time for a break.
 */

import { type useTranslation } from 'react-i18next';

import { type RtlsLockBreak, type RtlsLockIssue } from './types';

type T = ReturnType<typeof useTranslation>['t'];

/**
 * A lock warning: the server's detail, which names the anchor (`RTLS anchor
 * A4: low battery (6.81 V)`).
 */
export const describeLockIssue = (issue: RtlsLockIssue): string => issue.text;

/** A lock break, e.g. `14:02:11 · RTLS anchor A3: rebooted`. */
export const describeLockBreak = (t: T, entry: RtlsLockBreak): string => {
  const text = describeLockIssue(entry);
  return entry.time === undefined
    ? text
    : t('rtlsAnchorLock.break', {
        time: new Date(entry.time).toLocaleTimeString(),
        text,
      });
};
