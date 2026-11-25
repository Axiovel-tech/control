/**
 * @file The commit of the survey page: Commit (Retry once a commit left
 * anchors behind), why it is unavailable, what each anchor answered and
 * which already run the new survey ID, and then, under those results, the
 * offer to lock the anchors. The lock dialog opens only from that offer, so
 * it never covers what the commit came to.
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
  /** The anchors of the survey that are offline now. */
  offline: string[];
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
      {/* one short entry per anchor, side by side: eight lines would push
       * the lock offer out of sight */}
      <Box
        component='ul'
        sx={{
          m: 0,
          p: 0,
          listStyle: 'none',
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: 2,
        }}
      >
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
      </Box>
    </Box>
  );
};

const SurveyCommit = ({
  survey,
  controls,
  offline,
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
      {offline.length > 0 && controls.commitOffered && (
        <Alert severity='warning' data-testid='rtls-survey-offline'>
          {t('rtlsSurvey.commit.offline', {
            anchors: offline.map(nameOf).join(', '),
          })}
        </Alert>
      )}
      {leftBehind.length > 0 && (
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
                color='success'
                variant='contained'
                size='small'
                onClick={onLock}
              >
                {t('rtlsAnchorLock.lock')}
              </Button>
            )
          }
        >
          {t(
            locked
              ? 'rtlsSurvey.commit.committedLocked'
              : 'rtlsSurvey.commit.committed'
          )}
        </Alert>
      )}
    </Box>
  );
};

export default SurveyCommit;
