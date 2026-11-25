/**
 * @file The fit of a survey in numbers: its rms and worst pair, the server's
 * notes, each anchor's quality and every pair with its residual.
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { residualLevel } from '~/features/rtls/survey';
import {
  type RtlsSurvey,
  type RtlsSurveyDirection,
  type RtlsSurveyFit,
} from '~/features/rtls/survey-messages';

import { type AnchorNamer, centimetres, metres } from './labels';

const LEVEL_COLORS = {
  ok: 'success.main',
  warning: 'warning.main',
  error: 'error.main',
} as const;

const share = (direction: RtlsSurveyDirection | undefined): string =>
  direction?.share === undefined ? '—' : `${Math.round(direction.share * 100)}`;

const AnchorTable = ({
  fit,
  order,
  nameOf,
}: {
  fit: RtlsSurveyFit;
  order: string[];
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  return (
    <Table size='small' data-testid='rtls-survey-anchors-fit'>
      <TableHead>
        <TableRow>
          <TableCell>{t('rtlsSurvey.result.anchor')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.x')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.y')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.z')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.links')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.rms')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.worst')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.sigma')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.moved')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {order
          .filter((id) => id in fit.anchors)
          .map((id) => {
            const anchor = fit.anchors[id];
            return (
              <TableRow key={id} data-testid={`rtls-survey-fit-${id}`}>
                <TableCell>{nameOf(id)}</TableCell>
                <TableCell align='right'>{metres(anchor.x)}</TableCell>
                <TableCell align='right'>{metres(anchor.y)}</TableCell>
                <TableCell align='right'>{metres(anchor.z)}</TableCell>
                <TableCell align='right'>{anchor.links ?? '—'}</TableCell>
                <TableCell align='right'>
                  {centimetres(anchor.residualRmsM)}
                </TableCell>
                <TableCell
                  align='right'
                  sx={{ color: LEVEL_COLORS[residualLevel(anchor.worstPairM)] }}
                >
                  {centimetres(anchor.worstPairM)}
                </TableCell>
                <TableCell align='right'>
                  {centimetres(anchor.sigmaM)}
                </TableCell>
                <TableCell align='right'>
                  {centimetres(anchor.movedM)}
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
    </Table>
  );
};

const PairTable = ({
  pairs,
  nameOf,
}: {
  pairs: RtlsSurvey['pairs'];
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  // the worst pairs first: they are what the operator looks for
  const sorted = [...pairs].sort(
    (a, b) => Math.abs(b.residualM ?? 0) - Math.abs(a.residualM ?? 0)
  );
  return (
    <Table size='small' data-testid='rtls-survey-pairs'>
      <TableHead>
        <TableRow>
          <TableCell>{t('rtlsSurvey.result.pair')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.range')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.fitted')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.residual')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.share')}</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {sorted.map((pair) => {
          const level = residualLevel(pair.residualM);
          return (
            <TableRow key={`${pair.a}-${pair.b}`} data-level={level}>
              <TableCell>
                {t('rtlsSurvey.pair', { a: nameOf(pair.a), b: nameOf(pair.b) })}
              </TableCell>
              <TableCell align='right'>{metres(pair.rangeM)}</TableCell>
              <TableCell align='right'>{metres(pair.fittedM)}</TableCell>
              <TableCell
                align='right'
                sx={{ color: LEVEL_COLORS[level], fontWeight: 'bold' }}
              >
                {centimetres(pair.residualM)}
              </TableCell>
              <TableCell align='right'>
                {t('rtlsSurvey.result.shares', {
                  ab: share(pair.ab),
                  ba: share(pair.ba),
                })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

const SurveyResult = ({
  survey,
  nameOf,
}: {
  survey: RtlsSurvey;
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  const { fit, pairs } = survey;
  if (fit === undefined) {
    return null;
  }
  return (
    <Box
      data-testid='rtls-survey-result'
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Typography variant='body2'>
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
      <Box sx={{ overflowX: 'auto' }}>
        <AnchorTable fit={fit} order={survey.anchors} nameOf={nameOf} />
      </Box>
      <Box sx={{ overflowX: 'auto' }}>
        <PairTable pairs={pairs} nameOf={nameOf} />
      </Box>
    </Box>
  );
};

export default SurveyResult;
