import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';

import { getActiveUAVIds } from '~/features/uavs/selectors';

import { getShowSyncStatusByUavId } from './selectors';

const formatTime = (seconds: number): string =>
  `${seconds >= 0 ? 'T−' : 'T+'}${Math.abs(seconds).toFixed(0)} s`;

/** Compact fleet summary of the flight controllers' active start source. */
const ShowSyncStatusSummary = () => {
  const { t } = useTranslation();
  const byId = useSelector(getShowSyncStatusByUavId);
  const activeUavIds = useSelector(getActiveUAVIds);
  const statuses = activeUavIds
    .map((id) => byId[id])
    .filter((status) => status !== undefined);

  if (activeUavIds.length === 0) {
    return (
      <Box sx={{ px: 2, py: 1.5 }}>
        <Typography variant='subtitle2'>
          {t('showSync.title', 'Show synchronization')}
        </Typography>
        <Typography variant='caption' color='textSecondary'>
          {t('showSync.noActiveUavs', 'No active flight controllers')}
        </Typography>
      </Box>
    );
  }

  const sources = new Set(statuses.map(({ source }) => source));
  const source =
    statuses.length < activeUavIds.length
      ? ('incomplete' as const)
      : sources.size === 1
        ? statuses[0].source
        : ('mixed' as const);
  const sourceLabel = {
    none: t('showSync.source.none', 'None'),
    rc: t('showSync.source.rc', 'RC fallback'),
    'uwb-ltc': t('showSync.source.uwbLtc', 'UWB / LTC'),
    mixed: t('showSync.source.mixed', 'Mixed sources'),
    incomplete: t('showSync.source.incomplete', 'Waiting for status'),
  }[source];
  const locked = statuses.filter(({ locked }) => locked).length;
  const committed = statuses.filter(({ committed }) => committed).length;
  const times = statuses
    .map(({ secondsToStart }) => secondsToStart)
    .filter((value): value is number => value !== undefined);
  const timeLabel =
    times.length === 0
      ? undefined
      : Math.min(...times) === Math.max(...times)
        ? formatTime(times[0])
        : `${formatTime(Math.min(...times))}…${formatTime(Math.max(...times))}`;

  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      <Typography variant='subtitle2'>
        {t('showSync.title', 'Show synchronization')}
      </Typography>
      <Typography variant='caption' color='textSecondary'>
        {t(
          'showSync.summary',
          'Source: {{source}} · locked {{locked}}/{{total}} · committed {{committed}}/{{total}}{{time}}',
          {
            source: sourceLabel,
            locked,
            committed,
            total: activeUavIds.length,
            time: timeLabel ? ` · ${timeLabel}` : '',
          }
        )}
      </Typography>
    </Box>
  );
};

export default ShowSyncStatusSummary;
