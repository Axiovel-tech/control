/**
 * @file The fit of a survey in numbers: each anchor's position and quality
 * and, folded away under it, every pair with its residual. The fit's
 * summary, the gate and the commit are shown above, with the run.
 */

import ExpandLess from '@mui/icons-material/ExpandLess';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { pairsNeedALook, residualLevel } from '~/features/rtls/survey';
import {
  type RtlsSurvey,
  type RtlsSurveyDirection,
  type RtlsSurveyFit,
} from '~/features/rtls/survey-messages';

import {
  type AnchorNamer,
  centimetres,
  metres,
  signedCentimetres,
} from './labels';

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
  // only a server whose height groups are "about the same height" says how
  // far each anchor stands from its group
  const offsets = Object.values(fit.anchors).some(
    ({ heightOffsetM }) => heightOffsetM !== undefined
  );
  return (
    <Table size='small' data-testid='rtls-survey-anchors-fit'>
      <TableHead>
        <TableRow>
          <TableCell>{t('rtlsSurvey.result.anchor')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.x')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.y')}</TableCell>
          <TableCell align='right'>{t('rtlsSurvey.result.z')}</TableCell>
          {offsets && (
            <TableCell align='right'>
              {t('rtlsSurvey.result.heightOffset')}
            </TableCell>
          )}
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
                {offsets && (
                  <TableCell
                    align='right'
                    data-testid={`rtls-survey-offset-${id}`}
                  >
                    {signedCentimetres(anchor.heightOffsetM)}
                  </TableCell>
                )}
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
  // one row per pair: open only while a pair is past a bound
  const [pairsOpen, setPairsOpen] = useState(() => pairsNeedALook(survey));
  if (fit === undefined) {
    return null;
  }
  return (
    <Box
      data-testid='rtls-survey-result'
      sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
    >
      <Box sx={{ overflowX: 'auto' }}>
        <AnchorTable fit={fit} order={survey.anchors} nameOf={nameOf} />
      </Box>
      <Box>
        <Button
          data-testid='rtls-survey-pairs-toggle'
          size='small'
          color='inherit'
          aria-expanded={pairsOpen}
          endIcon={pairsOpen ? <ExpandLess /> : <ExpandMore />}
          onClick={() => setPairsOpen(!pairsOpen)}
        >
          {t('rtlsSurvey.result.pairs', {
            count: pairs.length,
            worst: centimetres(fit.worstM),
          })}
        </Button>
      </Box>
      <Collapse unmountOnExit in={pairsOpen}>
        <Box sx={{ overflowX: 'auto' }}>
          <PairTable pairs={pairs} nameOf={nameOf} />
        </Box>
      </Collapse>
    </Box>
  );
};

export default SurveyResult;
