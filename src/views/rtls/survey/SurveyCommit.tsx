/**
 * @file The commit of the survey page: Commit and lock (Retry once a commit
 * left anchors behind), why it is unavailable, what each anchor answered and
 * which already run the new survey ID, and the way to the lock dialog.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import {
  anchorsLeftBehind,
  type RtlsSurveyControls,
} from '~/features/rtls/survey';
import { type RtlsSurvey } from '~/features/rtls/survey-messages';

import { type AnchorNamer } from './labels';

type SurveyCommitProps = {
  survey: RtlsSurvey;
  controls: RtlsSurveyControls;
  /** Every online anchor reports its lock. */
  locked: boolean;
  nameOf: AnchorNamer;
  onCommit: () => void;
  onLock: () => void;
};

const WRITTEN_KEYS: Record<string, string> = {
  changed: 'rtlsSurvey.commit.written.changed',
  failed: 'rtlsSurvey.commit.written.failed',
};

const CommitResults = ({
  survey,
  nameOf,
}: {
  survey: RtlsSurvey;
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  const commit = survey.commit;
  if (commit === undefined) {
    return null;
  }
  return (
    <Box data-testid='rtls-survey-commit-results'>
      {commit.surveyId !== undefined && (
        <Typography variant='body2'>
          {t('rtlsSurvey.commit.surveyId', { id: commit.surveyId })}
        </Typography>
      )}
      <ul style={{ margin: 0, paddingLeft: 20 }}>
        {Object.entries(commit.results).map(([id, { detail, written }]) => (
          <li key={id} data-written={written}>
            <Typography
              variant='body2'
              color={written === 'failed' ? 'error' : undefined}
            >
              {t('rtlsSurvey.commit.result', {
                anchor: nameOf(id),
                written:
                  written in WRITTEN_KEYS ? t(WRITTEN_KEYS[written]) : written,
              })}
              {detail !== undefined &&
                ` ${t('rtlsSurvey.commit.detail', { detail })}`}
              {commit.running.includes(id) &&
                ` ${t('rtlsSurvey.commit.running')}`}
            </Typography>
          </li>
        ))}
      </ul>
    </Box>
  );
};

const SurveyCommit = ({
  survey,
  controls,
  locked,
  nameOf,
  onCommit,
  onLock,
}: SurveyCommitProps) => {
  const { t } = useTranslation();
  const leftBehind = anchorsLeftBehind(survey);
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {controls.commitOffered && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button
            data-testid='rtls-survey-commit'
            size='small'
            color='primary'
            variant='contained'
            disabled={!controls.canCommit}
            onClick={onCommit}
          >
            {t(
              controls.retry
                ? 'rtlsSurvey.commit.retry'
                : 'rtlsSurvey.commit.action'
            )}
          </Button>
          {controls.commitBlockedKey !== undefined && (
            <Typography
              data-testid='rtls-survey-commit-blocked'
              variant='body2'
              color='warning.main'
            >
              {t(controls.commitBlockedKey)}
            </Typography>
          )}
        </Box>
      )}
      {leftBehind.length > 0 && survey.state === 'ready' && (
        <Alert severity='error' data-testid='rtls-survey-incomplete'>
          {t('rtlsSurvey.commit.incomplete', {
            anchors: leftBehind.map(nameOf).join(', '),
          })}
        </Alert>
      )}
      <CommitResults survey={survey} nameOf={nameOf} />
      {survey.state === 'committed' && (
        <Alert
          severity='success'
          data-testid='rtls-survey-committed'
          action={
            locked ? undefined : (
              <Button
                data-testid='rtls-survey-lock'
                color='inherit'
                size='small'
                onClick={onLock}
              >
                {t('rtlsAnchorLock.lock')}
              </Button>
            )
          }
        >
          {t('rtlsSurvey.commit.committed')}
        </Alert>
      )}
    </Box>
  );
};

export default SurveyCommit;
