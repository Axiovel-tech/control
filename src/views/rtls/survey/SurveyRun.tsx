/**
 * @file The run of the survey page: Survey, Cancel and Refit, why Survey is
 * unavailable, the step the run is in, and what the last request came to.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { type RtlsSurveyControls } from '~/features/rtls/survey';
import {
  type RtlsSurvey,
  type RtlsSurveyOutcome,
} from '~/features/rtls/survey-messages';

import { type AnchorNamer } from './labels';

type SurveyRunProps = {
  survey?: RtlsSurvey;
  controls: RtlsSurveyControls;
  outcome?: RtlsSurveyOutcome;
  /** What the operator should know about the sketch (i18n keys). */
  hintKeys: string[];
  /** The sketch moved on since the fit on screen. */
  sketchChanged: boolean;
  nameOf: AnchorNamer;
  onStart: () => void;
  onCancel: () => void;
  onRefit: () => void;
};

/** The results that took effect: they need no line of their own. */
const QUIET_RESULTS = new Set(['started', 'cancelled', 'fitted', 'committed']);

const Progress = ({
  survey,
  nameOf,
}: {
  survey: RtlsSurvey;
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  const { initiator, state, step, steps } = survey;
  if (state === 'measuring') {
    const counted = step !== undefined && steps !== undefined && steps > 0;
    return (
      <Box data-testid='rtls-survey-progress'>
        <Typography variant='body2'>
          {counted
            ? t('rtlsSurvey.run.step', {
                step,
                steps,
                anchor: initiator === undefined ? '—' : nameOf(initiator),
              })
            : t('rtlsSurvey.run.measuring')}
        </Typography>
        <LinearProgress
          variant={counted ? 'determinate' : 'indeterminate'}
          value={counted ? ((step - 1) / steps) * 100 : undefined}
        />
      </Box>
    );
  }
  if (state === 'returning' || state === 'committing') {
    return (
      <Box data-testid='rtls-survey-progress'>
        <Typography variant='body2'>{t(`rtlsSurvey.run.${state}`)}</Typography>
        <LinearProgress />
      </Box>
    );
  }
  return null;
};

const SurveyRun = ({
  survey,
  controls,
  outcome,
  hintKeys,
  sketchChanged,
  nameOf,
  onStart,
  onCancel,
  onRefit,
}: SurveyRunProps) => {
  const { t } = useTranslation();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          data-testid='rtls-survey-start'
          size='small'
          color='primary'
          variant='contained'
          disabled={!controls.canStart}
          onClick={onStart}
        >
          {t(
            survey?.fit === undefined
              ? 'rtlsSurvey.run.start'
              : 'rtlsSurvey.run.startAgain'
          )}
        </Button>
        {survey?.state === 'measuring' && (
          <Button
            data-testid='rtls-survey-cancel'
            size='small'
            disabled={!controls.canCancel}
            onClick={onCancel}
          >
            {t('general.action.cancel')}
          </Button>
        )}
        {survey?.state === 'ready' && (
          <Button
            data-testid='rtls-survey-refit'
            size='small'
            variant={sketchChanged ? 'contained' : 'outlined'}
            disabled={!controls.canRefit}
            onClick={onRefit}
          >
            {t('rtlsSurvey.run.refit')}
          </Button>
        )}
      </Box>
      {controls.startBlockedKey !== undefined && (
        <Typography
          data-testid='rtls-survey-start-blocked'
          variant='body2'
          color='warning.main'
        >
          {t(controls.startBlockedKey)}
        </Typography>
      )}
      {hintKeys.map((key) => (
        <Typography key={key} variant='body2' color='textSecondary'>
          {t(key)}
        </Typography>
      ))}
      {sketchChanged && survey?.state === 'ready' && (
        <Typography variant='body2' color='textSecondary'>
          {t('rtlsSurvey.run.sketchChanged')}
        </Typography>
      )}
      {survey !== undefined && <Progress survey={survey} nameOf={nameOf} />}
      {survey?.state === 'idle' && survey.reason !== undefined && (
        <Alert severity='info' data-testid='rtls-survey-ended'>
          {survey.reason === 'cancelled'
            ? t('rtlsSurvey.run.cancelled')
            : survey.reason}
        </Alert>
      )}
      {survey?.state === 'failed' && (
        <Alert severity='error' data-testid='rtls-survey-failed'>
          {survey.reason ?? t('rtlsSurvey.run.failed')}
        </Alert>
      )}
      {outcome !== undefined && !QUIET_RESULTS.has(outcome.result) && (
        <Alert
          severity={outcome.result === 'warnings' ? 'warning' : 'error'}
          data-testid='rtls-survey-outcome'
          data-result={outcome.result}
        >
          {outcome.reason ?? t(`rtlsSurvey.outcome.${outcome.result}`)}
        </Alert>
      )}
    </Box>
  );
};

export default SurveyRun;
