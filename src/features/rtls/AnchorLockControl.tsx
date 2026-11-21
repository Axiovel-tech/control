/**
 * @file The lock control in the anchors panel header: shows whether the
 * anchors are locked and locks (through the dialog), unlocks (after a
 * confirmation) or opens the re-seal review of a broken lock.
 */

import Lock from '@mui/icons-material/Lock';
import LockOpen from '@mui/icons-material/LockOpen';
import Button from '@mui/material/Button';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { Tooltip } from '@skybrush/mui-components';

import { type AppDispatch } from '~/store/reducers';

import { unlockRtlsAnchors } from './lock-actions';
import { getRtlsAnchorLock, getRtlsAnchorLockState } from './selectors';
import { openRtlsLockDialog } from './slice';

const COLORS = {
  locked: 'success',
  broken: 'error',
  unlocked: 'warning',
} as const;

const AnchorLockControl = () => {
  const { t } = useTranslation();
  const dispatch: AppDispatch = useDispatch();
  const state = useSelector(getRtlsAnchorLockState);
  const lock = useSelector(getRtlsAnchorLock);

  if (state === 'unsupported') {
    return null;
  }

  const tooltip =
    state === 'locked'
      ? t('rtlsAnchorLock.control.lockedTooltip', {
          time:
            lock?.lockedAt === undefined
              ? '—'
              : new Date(lock.lockedAt).toLocaleTimeString(),
        })
      : t(`rtlsAnchorLock.control.${state}Tooltip`);

  return (
    <Tooltip content={tooltip}>
      <Button
        data-testid='rtls-anchors-panel.lock'
        size='small'
        variant={state === 'unlocked' ? 'outlined' : 'contained'}
        color={COLORS[state]}
        startIcon={state === 'unlocked' ? <LockOpen /> : <Lock />}
        sx={{ textTransform: 'none', py: 0 }}
        onClick={() => {
          if (state === 'locked') {
            void dispatch(unlockRtlsAnchors());
          } else {
            dispatch(openRtlsLockDialog());
          }
        }}
      >
        {t(`rtlsAnchorLock.control.${state}`)}
      </Button>
    </Tooltip>
  );
};

export default AnchorLockControl;
