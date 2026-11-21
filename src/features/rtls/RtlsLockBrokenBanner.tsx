/**
 * @file The banner raised when the anchor lock breaks: an anchor went
 * offline, rebooted, moved, changed a cell parameter or its firmware, or
 * left operation while locked. It sits under the app header, so it shows
 * whatever panel is open, and rings the alert bell once per new break. It
 * never withholds or cancels anything; the operator reviews and re-seals.
 */

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { triggerAlert } from '~/features/alert/slice';
import { type AppDispatch } from '~/store/reducers';

import { isLockBroken } from './anchor-lock';
import { describeLockBreak } from './lock-text';
import { getRtlsAnchorLock } from './selectors';
import { openRtlsLockDialog } from './slice';

/** Breaks listed in the banner; the dialog lists them all. */
const LISTED_BREAKS = 3;

const RtlsLockBrokenBanner = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const lock = useSelector(getRtlsAnchorLock);
  const breaks = isLockBroken(lock) ? lock!.breaks : []; // non-null: broken

  // ring the bell for every break that was not there before
  const seen = useRef(0);
  useEffect(() => {
    if (breaks.length > seen.current) {
      dispatch(triggerAlert());
    }
    seen.current = breaks.length;
  }, [breaks.length, dispatch]);

  if (breaks.length === 0) {
    return null;
  }

  return (
    <Alert
      data-testid='rtls-lock-broken-banner'
      severity='error'
      variant='filled'
      sx={{ borderRadius: 0, flexShrink: 0 }}
      action={
        <Button
          color='inherit'
          size='small'
          sx={{ whiteSpace: 'nowrap' }}
          onClick={() => dispatch(openRtlsLockDialog())}
        >
          {t('rtlsAnchorLock.banner.review')}
        </Button>
      }
    >
      <AlertTitle>
        {t('rtlsAnchorLock.banner.title', { count: breaks.length })}
      </AlertTitle>
      {breaks.slice(0, LISTED_BREAKS).map((entry, index) => (
        <div key={index}>{describeLockBreak(t, entry)}</div>
      ))}
      {breaks.length > LISTED_BREAKS && (
        <div>
          {t('rtlsAnchorLock.banner.more', {
            count: breaks.length - LISTED_BREAKS,
          })}
        </div>
      )}
    </Alert>
  );
};

export default RtlsLockBrokenBanner;
