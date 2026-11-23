/**
 * @file The lock control in the anchors panel header: "Locked" (a click
 * unlocks) or "Not locked" with how many anchors are (a click opens the lock
 * dialog; Unlock beside it while some anchors are locked).
 */

import Lock from '@mui/icons-material/Lock';
import LockOpen from '@mui/icons-material/LockOpen';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { Tooltip } from '@skybrush/mui-components';

import { type AppDispatch } from '~/store/reducers';

import { unlockRtlsAnchors } from './anchor-lock';
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
  const unlock = () => void dispatch(unlockRtlsAnchors());
  return (
    <>
      <Tooltip
        content={t(
          lock.locked ? 'rtlsAnchorLock.control.unlock' : 'rtlsAnchorLock.lock'
        )}
      >
        <Button
          data-testid='rtls-anchors-panel.lock'
          size='small'
          variant={lock.locked ? 'contained' : 'outlined'}
          color={lock.locked ? 'success' : 'warning'}
          startIcon={lock.locked ? <Lock /> : <LockOpen />}
          sx={{ textTransform: 'none', py: 0 }}
          onClick={lock.locked ? unlock : () => dispatch(openRtlsLockDialog())}
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
      {/* a partly locked cell can also be unlocked again */}
      {partly && (
        <Tooltip content={t('rtlsAnchorLock.control.unlock')}>
          <IconButton
            data-testid='rtls-anchors-panel.unlock'
            size='small'
            onClick={unlock}
          >
            <LockOpen fontSize='small' />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
};

export default AnchorLockControl;
