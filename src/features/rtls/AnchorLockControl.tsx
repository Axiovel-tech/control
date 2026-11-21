/**
 * @file The lock control in the anchors panel header: "Locked", or "Not
 * locked" with how many anchors are; a click unlocks (after a confirmation)
 * or opens the lock dialog.
 */

import Lock from '@mui/icons-material/Lock';
import LockOpen from '@mui/icons-material/LockOpen';
import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { Tooltip } from '@skybrush/mui-components';

import { type AppDispatch } from '~/store/reducers';

import { unlockRtlsAnchors } from './lock-actions';
import { getRtlsAnchorLock } from './selectors';
import { openRtlsLockDialog } from './slice';

const AnchorLockControl = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const lock = useSelector(getRtlsAnchorLock);

  if (lock === undefined) {
    return null;
  }

  const partly = !lock.locked && lock.lockedCount > 0;
  return (
    <Tooltip
      content={t(
        lock.locked
          ? 'rtlsAnchorLock.control.unlock'
          : 'rtlsAnchorLock.control.lock'
      )}
    >
      <Button
        data-testid='rtls-anchors-panel.lock'
        size='small'
        variant={lock.locked ? 'contained' : 'outlined'}
        color={lock.locked ? 'success' : 'warning'}
        startIcon={lock.locked ? <Lock /> : <LockOpen />}
        sx={{ textTransform: 'none', py: 0 }}
        onClick={() => {
          if (lock.locked) {
            void dispatch(unlockRtlsAnchors());
          } else {
            dispatch(openRtlsLockDialog());
          }
        }}
      >
        {lock.locked
          ? t('rtlsAnchorLock.control.locked')
          : partly
            ? t('rtlsAnchorLock.control.partly', {
                locked: lock.lockedCount,
                total: lock.anchorCount,
              })
            : t('rtlsAnchorLock.control.unlocked')}
      </Button>
    </Tooltip>
  );
};

export default AnchorLockControl;
