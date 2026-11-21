/**
 * @file Display text of the anchor lock's warnings and breaks: the server's
 * own text, prefixed with the anchor and, for a break, the time.
 */

import { type useTranslation } from 'react-i18next';

import { type RtlsLockBreak, type RtlsLockIssue } from './types';

type T = ReturnType<typeof useTranslation>['t'];

/** A lock warning, e.g. `Anchor 103: moved`. */
export const describeLockIssue = (t: T, issue: RtlsLockIssue): string =>
  issue.device === undefined
    ? issue.text
    : t('rtlsAnchorLock.issue', { device: issue.device, text: issue.text });

/** A lock break, e.g. `14:02:11 · Anchor 103: rebooted`. */
export const describeLockBreak = (t: T, entry: RtlsLockBreak): string => {
  const text = describeLockIssue(t, entry);
  return entry.time === undefined
    ? text
    : t('rtlsAnchorLock.break', {
        time: new Date(entry.time).toLocaleTimeString(),
        text,
      });
};
