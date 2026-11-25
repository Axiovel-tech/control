/**
 * @file The commit gate of a fit: the server's blocks, which nothing
 * dismisses, and its warnings with the one acknowledgement a commit needs.
 */

import Alert from '@mui/material/Alert';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import {
  type RtlsSurveyGate,
  type RtlsSurveyGateEntry,
} from '~/features/rtls/survey-messages';

import { type AnchorNamer } from './labels';

type SurveyGateProps = {
  gate: RtlsSurveyGate;
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
  gate,
  nameOf,
  acknowledged,
  disabled,
  onAcknowledge,
}: SurveyGateProps) => {
  const { t } = useTranslation();
  return (
    <>
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
    </>
  );
};

export default SurveyGate;
