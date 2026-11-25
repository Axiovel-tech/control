/**
 * @file What the anchors store, shown while the server holds no fit of the
 * cell: after a reload of the server, while a new survey runs, and after one
 * was cancelled or failed. A survey that did not finish changes nothing on
 * the anchors, so their last committed positions stay on the page.
 */

import Box from '@mui/material/Box';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useTranslation } from 'react-i18next';

import { type RtlsSurveyAnchor } from '~/features/rtls/survey-sketch';

import { type AnchorNamer, metres } from './labels';

const SurveyStored = ({
  anchors,
  nameOf,
}: {
  /** The anchors that store a position, in slot order. */
  anchors: RtlsSurveyAnchor[];
  nameOf: AnchorNamer;
}) => {
  const { t } = useTranslation();
  if (anchors.length === 0) {
    return null;
  }
  return (
    <Box
      data-testid='rtls-survey-stored'
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}
    >
      <Typography variant='body2'>{t('rtlsSurvey.stored.title')}</Typography>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>{t('rtlsSurvey.result.anchor')}</TableCell>
              <TableCell align='right'>{t('rtlsSurvey.result.x')}</TableCell>
              <TableCell align='right'>{t('rtlsSurvey.result.y')}</TableCell>
              <TableCell align='right'>{t('rtlsSurvey.result.z')}</TableCell>
              <TableCell align='right'>
                {t('rtlsSurvey.stored.survey')}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {anchors.map(({ id, stored, storedDown, surveyId }) => (
              <TableRow key={id} data-testid={`rtls-survey-stored-${id}`}>
                <TableCell>{nameOf(id)}</TableCell>
                <TableCell align='right'>{metres(stored?.north)}</TableCell>
                <TableCell align='right'>{metres(stored?.east)}</TableCell>
                <TableCell align='right'>{metres(storedDown)}</TableCell>
                <TableCell align='right'>{surveyId ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
};

export default SurveyStored;
