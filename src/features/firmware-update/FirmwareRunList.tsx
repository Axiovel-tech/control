import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import type { FirmwareUpdateRun } from './types';

type Props = {
  runs: FirmwareUpdateRun[];
};

const progressOf = (run: FirmwareUpdateRun): number | undefined => {
  if (
    run.bytesTotal === undefined ||
    run.bytesTotal <= 0 ||
    run.bytesTransferred === undefined
  ) {
    return undefined;
  }

  return Math.min(
    100,
    Math.round((run.bytesTransferred / run.bytesTotal) * 100)
  );
};

export const FirmwareRunList = ({ runs }: Props) => {
  const { t } = useTranslation();
  return (
    <List disablePadding>
      {runs.map((run) => {
        const progress = progressOf(run);
        const error = run.error?.detail ?? run.error?.code;
        const installed =
          run.observedVersion || run.observedHash
            ? t('flightFirmwareUpdate.progress.installed', {
                version:
                  run.observedVersion ?? t('flightFirmwareUpdate.unknown'),
                hash: run.observedHash ?? t('flightFirmwareUpdate.unknown'),
              })
            : undefined;
        return (
          <ListItem
            key={run.id}
            disableGutters
            data-testid={`flight-firmware-update.result-${run.id}-${run.status}`}
            data-phase={run.phase}
          >
            <Box sx={{ width: '100%' }}>
              <ListItemText
                primary={t('flightFirmwareUpdate.progress.target', {
                  id: run.id,
                })}
                secondary={
                  installed
                    ? t('flightFirmwareUpdate.progress.phaseAndInstalled', {
                        phase: t(`flightFirmwareUpdate.phase.${run.phase}`),
                        installed,
                      })
                    : t(`flightFirmwareUpdate.phase.${run.phase}`)
                }
              />
              {run.status === 'running' && run.phase !== 'queued' ? (
                <LinearProgress
                  variant={
                    progress === undefined ? 'indeterminate' : 'determinate'
                  }
                  value={progress}
                />
              ) : null}
              {error ? (
                <Typography color='error' variant='caption'>
                  {t('flightFirmwareUpdate.progress.error', { detail: error })}
                </Typography>
              ) : null}
              {run.status === 'indeterminate' ? (
                <Alert severity='warning' sx={{ mt: 1 }}>
                  {t('flightFirmwareUpdate.progress.indeterminate')}
                </Alert>
              ) : null}
            </Box>
          </ListItem>
        );
      })}
    </List>
  );
};

export default FirmwareRunList;
