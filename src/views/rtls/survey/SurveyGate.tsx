/**
 * @file The fit in one line and its commit gate, shown with the run and the
 * commit, never under the tables: the server's blocks, which nothing
 * dismisses, its warnings with the one acknowledgement a commit needs, or
 * the word that there is neither.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { gateVerdict } from '~/features/rtls/survey';
import {
  type RtlsSurvey,
  type RtlsSurveyGateEntry,
} from '~/features/rtls/survey-messages';

import { type AnchorNamer, centimetres } from './labels';

type SurveyGateProps = {
  survey: RtlsSurvey;
  nameOf: AnchorNamer;
  acknowledged: boolean;
  disabled?: boolean;
  onAcknowledge: (acknowledged: boolean) => void;
};

const GateEntries = ({
  entries,
  nameOf,
}: {
  entries: RtlsSurveyGateEntry[];
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  return (
    <ul style={{ margin: 0, paddingLeft: 20 }}>
      {entries.map(({ code, detail, device, peer }, index) => (
        <li key={index} data-code={code}>
          <Typography variant='body2'>
            {device === undefined
              ? detail
              : peer === undefined
                ? t('rtlsSurvey.gate.entry', { anchor: nameOf(device), detail })
                : t('rtlsSurvey.gate.pairEntry', {
                    a: nameOf(device),
                    b: nameOf(peer),
                    detail,
                  })}
          </Typography>
        </li>
      ))}
    </ul>
  );
};

const SurveyGate = ({
  survey,
  nameOf,
  acknowledged,
  disabled,
  onAcknowledge,
}: SurveyGateProps) => {
  const { t } = useTranslation();
  const { fit, gate } = survey;
  if (fit === undefined) {
    return null;
  }
  const verdict = gateVerdict(gate);
  return (
    <Box
      data-testid='rtls-survey-gate'
      data-verdict={verdict}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Typography variant='body2' data-testid='rtls-survey-summary'>
        {t('rtlsSurvey.result.summary', {
          rms: centimetres(fit.rmsM),
          worst: centimetres(fit.worstM),
        })}
        {fit.planar && ` ${t('rtlsSurvey.result.planar')}`}
      </Typography>
      {fit.notes.length > 0 && (
        <Alert severity='info' data-testid='rtls-survey-notes'>
          {fit.notes.map((note) => (
            <div key={note}>{note}</div>
          ))}
        </Alert>
      )}
      {/* a fit already on the anchors has nothing left to pass */}
      {verdict === 'clear' && survey.state !== 'committed' && (
        <Alert
          severity='success'
          data-testid='rtls-survey-gate-clear'
          sx={{ py: 0 }}
        >
          {t('rtlsSurvey.gate.clear')}
        </Alert>
      )}
      {gate.blocked.length > 0 && (
        <Alert severity='error' data-testid='rtls-survey-blocked'>
          <Typography variant='subtitle2'>
            {t('rtlsSurvey.gate.blocked')}
          </Typography>
          <GateEntries entries={gate.blocked} nameOf={nameOf} />
        </Alert>
      )}
      {gate.warnings.length > 0 && (
        <Alert severity='warning' data-testid='rtls-survey-warnings'>
          <GateEntries entries={gate.warnings} nameOf={nameOf} />
          <FormControlLabel
            control={
              <Checkbox
                data-testid='rtls-survey-acknowledge'
                size='small'
                checked={acknowledged}
                disabled={disabled}
                onChange={(event) => onAcknowledge(event.target.checked)}
              />
            }
            label={t('rtlsSurvey.gate.acknowledge')}
          />
        </Alert>
      )}
    </Box>
  );
};

export default SurveyGate;
