import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import type { FirmwareUpdateTarget } from './types';

type Props = {
  error?: string;
  loading: boolean;
  onSelected: (id: string, selected: boolean) => void;
  selectedIds: string[];
  targets: FirmwareUpdateTarget[];
};

const safetyValue = (value: boolean | undefined): string => {
  if (value === true) {
    return 'pass';
  }

  return value === false ? 'fail' : 'unknown';
};

const FirmwareTargetList = ({
  error,
  loading,
  onSelected,
  selectedIds,
  targets,
}: Props) => {
  const { t } = useTranslation();
  const selected = new Set(selectedIds);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}>
        <CircularProgress size={20} />
        <Typography>{t('flightFirmwareUpdate.targets.loading')}</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity='error'>
        {t('flightFirmwareUpdate.targets.loadFailed', { detail: error })}
      </Alert>
    );
  }

  if (targets.length === 0) {
    return (
      <Alert severity='info'>{t('flightFirmwareUpdate.targets.empty')}</Alert>
    );
  }

  return (
    <List dense disablePadding>
      {targets.map((target) => {
        const current = target.currentVersion
          ? t('flightFirmwareUpdate.targets.currentFirmware', {
              version: target.currentVersion,
              hash: target.currentHash ?? t('flightFirmwareUpdate.unknown'),
            })
          : t('flightFirmwareUpdate.targets.currentUnknown');
        const safety = t('flightFirmwareUpdate.targets.safetySummary', {
          connected: t(
            `flightFirmwareUpdate.safety.${safetyValue(target.safety.connected)}`
          ),
          disarmed: t(
            `flightFirmwareUpdate.safety.${safetyValue(target.safety.disarmed)}`
          ),
          onGround: t(
            `flightFirmwareUpdate.safety.${safetyValue(target.safety.onGround)}`
          ),
          power: t(
            `flightFirmwareUpdate.safety.${safetyValue(
              target.safety.powerSufficient
            )}`
          ),
        });
        const incompatibility = target.error?.detail
          ? t('flightFirmwareUpdate.targets.incompatibleDetail', {
              detail: target.error.detail,
            })
          : t('flightFirmwareUpdate.targets.incompatible');

        return (
          <ListItem
            key={target.id}
            disableGutters
            data-testid={`flight-firmware-update.target-${target.id}`}
          >
            <FormControlLabel
              disabled={!target.compatible}
              control={
                <Checkbox
                  checked={selected.has(target.id)}
                  data-testid={`flight-firmware-update.target-${target.id}.select`}
                  onChange={(event) =>
                    onSelected(target.id, event.target.checked)
                  }
                />
              }
              label={target.label ?? target.id}
              sx={{ minWidth: 160 }}
            />
            <ListItemText
              primary={current}
              secondary={target.compatible ? safety : incompatibility}
            />
          </ListItem>
        );
      })}
    </List>
  );
};

export default FirmwareTargetList;
