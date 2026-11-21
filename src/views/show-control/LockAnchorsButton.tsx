import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { StatusLight } from '@skybrush/mui-components';

import { isRtlsAnchorLockRequired } from '~/features/rtls/selectors';
import { openRtlsLockDialog } from '~/features/rtls/slice';
import { getSetupStageStatuses } from '~/features/show/stages';
import type { RootState } from '~/store/reducers';

/**
 * The "Lock anchors" step: its light is the server's verdict; a click opens
 * the lock dialog. Hidden when no lock is required.
 */
const LockAnchorsButton = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const required = useSelector(isRtlsAnchorLockRequired);
  const status = useSelector(
    (state: RootState) => getSetupStageStatuses(state).lockAnchors
  );

  if (!required) {
    return null;
  }

  return (
    <ListItem disablePadding>
      <ListItemButton
        data-testid='show-control.lock-anchors'
        onClick={() => dispatch(openRtlsLockDialog())}
      >
        <StatusLight status={status} />
        <ListItemText
          primary={t('rtlsAnchorLock.title')}
          secondary={t('rtlsAnchorLock.step.description')}
        />
      </ListItemButton>
    </ListItem>
  );
};

export default LockAnchorsButton;
