import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import type { FirmwareArtifactMetadata, FirmwareUpdateTarget } from './types';

type Props = {
  artifact: FirmwareArtifactMetadata;
  confirmed: boolean;
  onConfirmed: (confirmed: boolean) => void;
  targets: FirmwareUpdateTarget[];
};

const FirmwareUpdateConfirmation = ({
  artifact,
  confirmed,
  onConfirmed,
  targets,
}: Props) => {
  const { t } = useTranslation();
  const targetNames = targets
    .map((target) => target.label ?? target.id)
    .join(', ');
  return (
    <Paper variant='outlined' sx={{ mt: 2, p: 2 }}>
      <Typography variant='subtitle1'>
        {t('flightFirmwareUpdate.confirmation.title')}
      </Typography>
      <Typography variant='body2'>
        {t('flightFirmwareUpdate.confirmation.artifact', {
          version: artifact.version,
          hash: artifact.gitHash,
          sha256: artifact.sha256,
        })}
      </Typography>
      <Typography variant='body2'>
        {t('flightFirmwareUpdate.confirmation.targets', {
          count: targets.length,
          targets: targetNames,
        })}
      </Typography>
      <Alert severity='warning' sx={{ my: 1 }}>
        {t('flightFirmwareUpdate.confirmation.sequenceWarning')}
      </Alert>
      <Typography component='div' variant='body2'>
        {t('flightFirmwareUpdate.confirmation.safetyTitle')}
        <ul>
          <li>{t('flightFirmwareUpdate.confirmation.safetyDisarmed')}</li>
          <li>{t('flightFirmwareUpdate.confirmation.safetyGround')}</li>
          <li>{t('flightFirmwareUpdate.confirmation.safetyPower')}</li>
          <li>{t('flightFirmwareUpdate.confirmation.safetyLink')}</li>
        </ul>
      </Typography>
      <FormControlLabel
        control={
          <Checkbox
            checked={confirmed}
            data-testid='flight-firmware-update.confirm'
            onChange={(event) => onConfirmed(event.target.checked)}
          />
        }
        label={t('flightFirmwareUpdate.confirmation.approve')}
      />
    </Paper>
  );
};

export default FirmwareUpdateConfirmation;
