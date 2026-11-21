import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { StatusLight } from '@skybrush/mui-components';

import {
  getRtlsAnchorLockState,
  getRtlsShowGateRefusal,
  isRtlsAnchorLockRequired,
} from '~/features/rtls/selectors';
import { openRtlsLockDialog } from '~/features/rtls/slice';
import { getSetupStageStatuses } from '~/features/show/stages';
import type { RootState } from '~/store/reducers';

/**
 * Pre-flight item "Anchors locked": the server refuses a new authorization
 * or a changed authorized start while its gate requires locked anchors, so
 * the operator sees it before trying. It shows the server's own verdict
 * (`anchorLock.showGate`) and opens the lock (or re-seal) dialog. Hidden when
 * no lock is required.
 */
const LockAnchorsButton = () => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const required = useSelector(isRtlsAnchorLockRequired);
  const lockState = useSelector(getRtlsAnchorLockState);
  const refusal = useSelector(getRtlsShowGateRefusal);
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
          primary={t('rtlsAnchorLock.preflight.title')}
          secondary={
            refusal?.reason ?? t(`rtlsAnchorLock.preflight.${lockState}`)
          }
        />
      </ListItemButton>
    </ListItem>
  );
};

export default LockAnchorsButton;
