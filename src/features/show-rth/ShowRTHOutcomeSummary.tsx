import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import type { ShowRTHStatus } from './slice';

type Props = {
  status: ShowRTHStatus;
};

/**
 * Formats a show time given in microseconds as seconds with one decimal.
 */
export function formatBranchTime(branchTimeUs: number): string {
  return (branchTimeUs / 1_000_000).toFixed(1);
}

const ShowRTHOutcomeSummary = ({ status }: Props) => {
  const { t } = useTranslation();

  switch (status.state) {
    case 'error':
      return <Typography color='error'>{status.error}</Typography>;

    case 'sent': {
      const failures = Object.entries(status.failures);
      return (
        <Box>
          <Typography>
            {t('showRTHDialog.sent', {
              count: status.succeeded.length,
              time: formatBranchTime(status.branchTimeUs),
            })}
          </Typography>
          {failures.length > 0 && (
            <>
              <Typography color='error'>
                {t('showRTHDialog.failures', { count: failures.length })}
              </Typography>
              {failures.map(([id, reason]) => (
                <Typography key={id} variant='body2' color='error'>
                  {t('showRTHDialog.failure', { id, reason })}
                </Typography>
              ))}
            </>
          )}
        </Box>
      );
    }

    default:
      return null;
  }
};

export default ShowRTHOutcomeSummary;
