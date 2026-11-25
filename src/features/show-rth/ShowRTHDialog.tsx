import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { connect } from 'react-redux';

import { DraggableDialog } from '@skybrush/mui-components';

import { getUAVIdsParticipatingInMission } from '~/features/mission/selectors';
import type { RootState } from '~/store/reducers';

import { sendShowRTH } from './actions';
import {
  getShowRTHRows,
  getShowRTHTarget,
  type ShowRTHSelection,
} from './selection';
import { selectShowRTHDialog } from './selectors';
import ShowRTHDroneSelection from './ShowRTHDroneSelection';
import ShowRTHOutcomeSummary from './ShowRTHOutcomeSummary';
import { closeShowRTHDialog, type ShowRTHStatus } from './slice';

type StateProps = {
  initialSelection: ShowRTHSelection;
  missionUAVIds: string[];
  open: boolean;
  planHolders: string[];
  status: ShowRTHStatus;
};

type DispatchProps = {
  closeDialog: () => void;
  sendShowRTH: (selection: ShowRTHSelection) => void;
};

type Props = DispatchProps & StateProps;

const ShowRTHDialog = ({
  closeDialog,
  initialSelection,
  missionUAVIds,
  planHolders,
  sendShowRTH,
  status,
}: Props) => {
  const { t } = useTranslation();
  const [selection, setSelection] = useState(initialSelection);
  const rows = useMemo(
    () => getShowRTHRows(missionUAVIds, planHolders),
    [missionUAVIds, planHolders]
  );

  const sending = status.state === 'sending';
  const sent = status.state === 'sent';
  const canSend =
    !sending && !sent && getShowRTHTarget(selection) !== undefined;

  return (
    <DraggableDialog
      fullWidth
      disableEscapeKeyDown={sending}
      maxWidth='sm'
      open
      title={t('showRTHDialog.title')}
      onClose={closeDialog}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          paddingTop: 2,
          paddingX: 3,
        }}
      >
        <Typography>{t('showRTHDialog.description')}</Typography>
        <ShowRTHDroneSelection
          disabled={sending || sent}
          rows={rows}
          selection={selection}
          onChange={setSelection}
        />
        <ShowRTHOutcomeSummary status={status} />
      </Box>
      <DialogActions>
        <Button disabled={sending} onClick={closeDialog}>
          {t('general.action.close')}
        </Button>
        <Button
          color='error'
          disabled={!canSend}
          loading={sending}
          variant='contained'
          onClick={() => sendShowRTH(selection)}
        >
          {t('showRTHDialog.send')}
        </Button>
      </DialogActions>
    </DraggableDialog>
  );
};

/**
 * Wrapper that only renders the dialog when it is open, so that its selection
 * starts from the initial selection every time it opens.
 */
const ShowRTHDialogWrapper = ({ open, ...rest }: Props) =>
  open ? <ShowRTHDialog open {...rest} /> : null;

const ConnectedShowRTHDialog = connect(
  // mapStateToProps
  (state: RootState) => {
    const { initialSelection, open, planHolders, status } =
      selectShowRTHDialog(state);
    return {
      initialSelection,
      missionUAVIds: getUAVIdsParticipatingInMission(state),
      open,
      planHolders,
      status,
    };
  },
  // mapDispatchToProps
  {
    closeDialog: closeShowRTHDialog,
    sendShowRTH,
  }
)(ShowRTHDialogWrapper);

export default ConnectedShowRTHDialog;
