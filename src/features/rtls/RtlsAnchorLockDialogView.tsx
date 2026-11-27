/**
 * @file The lock dialog as its state shows it (`anchor-lock-dialog.ts`).
 * While the resurvey check measures, nothing closes it: the server cannot
 * stop the check.
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { DraggableDialog } from '@skybrush/mui-components';

import { type LockDialogState } from './anchor-lock-dialog';

type Props = {
  open: boolean;
  state: LockDialogState;
  onClose: () => void;
  onLock: () => void;
  onResurvey: (checked: boolean) => void;
  onAcknowledge: (checked: boolean) => void;
};

const RtlsAnchorLockDialogView = ({
  open,
  state,
  onClose,
  onLock,
  onResurvey,
  onAcknowledge,
}: Props) => {
  const { t } = useTranslation();
  const { acknowledged, busy, error, measuring, resurvey, warnings } = state;

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='sm'
      title={t('rtlsAnchorLock.title')}
      // no Esc, no backdrop: a measuring check runs to its end
      onClose={measuring ? undefined : onClose}
    >
      <DialogContent data-testid='rtls-lock-dialog'>
        <Typography variant='body2'>
          {t('rtlsAnchorLock.dialog.text')}
        </Typography>
        <FormControlLabel
          control={
            <Checkbox
              data-testid='rtls-lock-resurvey'
              checked={resurvey}
              disabled={busy || warnings.length > 0}
              onChange={(event) => onResurvey(event.target.checked)}
            />
          }
          label={t('rtlsAnchorLock.dialog.resurvey')}
        />
        {measuring && (
          <>
            <LinearProgress data-testid='rtls-lock-measuring' />
            <Typography variant='caption' color='text.secondary'>
              {t('rtlsAnchorLock.dialog.measuring')}
            </Typography>
          </>
        )}
        {warnings.length > 0 && (
          <>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 20 }}>
              {warnings.map((text, index) => (
                <li key={index}>
                  <Typography variant='body2'>{text}</Typography>
                </li>
              ))}
            </ul>
            <FormControlLabel
              control={
                <Checkbox
                  data-testid='rtls-lock-acknowledge'
                  checked={acknowledged}
                  disabled={busy}
                  onChange={(event) => onAcknowledge(event.target.checked)}
                />
              }
              label={t('rtlsAnchorLock.dialog.acknowledge')}
            />
          </>
        )}
        {error !== undefined && (
          <Alert severity='error' sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          data-testid='rtls-lock-cancel'
          disabled={measuring}
          onClick={onClose}
        >
          {t('general.action.cancel')}
        </Button>
        <Button
          data-testid='rtls-lock-confirm'
          color='primary'
          variant='contained'
          disabled={busy || (warnings.length > 0 && !acknowledged)}
          onClick={onLock}
        >
          {t('rtlsAnchorLock.lock')}
        </Button>
      </DialogActions>
    </DraggableDialog>
  );
};

export default RtlsAnchorLockDialogView;
