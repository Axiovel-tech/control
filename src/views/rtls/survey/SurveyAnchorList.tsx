/**
 * @file The anchor list of the survey page: who is surveyed, each anchor's
 * height group, and which anchor is the origin and which fixes the X axis,
 * each choice with what it does in plain words. One action lays out today's
 * standard cell from the anchors' slots; the height groups the operator
 * added can be removed again.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  BUILT_IN_GROUPS,
  groupSize,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withGroupAdded,
  withGroupRemoved,
  withOrigin,
  withXAxis,
} from '~/features/rtls/survey-sketch';

import { groupColor, groupNames } from './labels';

type SurveyAnchorListProps = {
  anchors: RtlsSurveyAnchor[];
  sketch: RtlsSurveySketch;
  /** The operating anchors left out: the server refuses to survey beside them. */
  leftOut: string[];
  /** The frame shown was taken from the survey the server holds. */
  restored: boolean;
  onChange: (sketch: RtlsSurveySketch) => void;
};

/** A column head with, under it, what the choice in that column does. */
const ChoiceHead = ({
  align,
  title,
  explanation,
}: {
  align?: 'center';
  title: string;
  explanation: string;
}) => (
  <TableCell align={align} sx={{ verticalAlign: 'top' }}>
    {title}
    <Typography
      variant='caption'
      color='textSecondary'
      component='div'
      sx={{ fontWeight: 'normal', lineHeight: 1.25 }}
    >
      {explanation}
    </Typography>
  </TableCell>
);

const SurveyAnchorList = ({
  anchors,
  sketch,
  leftOut,
  restored,
  onChange,
}: SurveyAnchorListProps) => {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const groups = groupNames(sketch, t);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button
          data-testid='rtls-survey-standard'
          size='small'
          variant='outlined'
          onClick={() => onChange(standardCellSketch(anchors, sketch))}
        >
          {t('rtlsSurvey.standard.action')}
        </Button>
        {sketch.standard && (
          <Chip
            data-testid='rtls-survey-standard-on'
            size='small'
            color='primary'
            variant='outlined'
            label={t('rtlsSurvey.standard.on')}
          />
        )}
        {restored && (
          <Chip
            data-testid='rtls-survey-restored'
            size='small'
            variant='outlined'
            label={t('rtlsSurvey.restored')}
          />
        )}
      </Box>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell padding='checkbox' />
            <TableCell sx={{ verticalAlign: 'top' }}>
              {t('rtlsSurvey.list.anchor')}
            </TableCell>
            <ChoiceHead
              title={t('rtlsSurvey.list.group')}
              explanation={t('rtlsSurvey.list.groupMeans')}
            />
            <ChoiceHead
              align='center'
              title={t('rtlsSurvey.list.origin')}
              explanation={t('rtlsSurvey.list.originMeans')}
            />
            <ChoiceHead
              align='center'
              title={t('rtlsSurvey.list.xAxis')}
              explanation={t('rtlsSurvey.list.xAxisMeans')}
            />
          </TableRow>
        </TableHead>
        <TableBody>
          {anchors.map(({ id, name }) => {
            const included = !sketch.excluded.includes(id);
            return (
              <TableRow key={id} data-testid={`rtls-survey-row-${id}`}>
                <TableCell padding='checkbox'>
                  <Checkbox
                    size='small'
                    checked={included}
                    slotProps={{
                      input: { 'aria-label': t('rtlsSurvey.list.include') },
                    }}
                    onChange={(event) =>
                      onChange(
                        withAnchorIncluded(sketch, id, event.target.checked)
                      )
                    }
                  />
                </TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>
                  {name}
                  {leftOut.includes(id) && (
                    <Typography
                      data-testid={`rtls-survey-left-out-${id}`}
                      variant='caption'
                      color='warning.main'
                      component='div'
                    >
                      {t('rtlsSurvey.list.leftOut')}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    size='small'
                    variant='standard'
                    disabled={!included}
                    value={Math.min(sketch.groupOf[id] ?? 0, groups.length - 1)}
                    onChange={(event) =>
                      onChange(
                        withAnchorGroup(sketch, id, Number(event.target.value))
                      )
                    }
                  >
                    {groups.map((group, level) => (
                      <MenuItem key={level} value={level}>
                        {group}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell align='center' padding='none'>
                  <Radio
                    size='small'
                    disabled={!included}
                    checked={sketch.origin === id}
                    slotProps={{
                      input: { 'aria-label': t('rtlsSurvey.list.origin') },
                    }}
                    onChange={() => onChange(withOrigin(sketch, id))}
                  />
                </TableCell>
                <TableCell align='center' padding='none'>
                  <Radio
                    size='small'
                    disabled={!included}
                    checked={sketch.xAxis === id}
                    slotProps={{
                      input: { 'aria-label': t('rtlsSurvey.list.xAxis') },
                    }}
                    onChange={() => onChange(withXAxis(sketch, id))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Box
        data-testid='rtls-survey-groups'
        sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      >
        {sketch.groups.map((_, index) => {
          const level = index + BUILT_IN_GROUPS;
          return (
            <Chip
              key={level}
              data-testid={`rtls-survey-group-${level}`}
              size='small'
              variant='outlined'
              sx={{ borderColor: groupColor(level), color: groupColor(level) }}
              label={t('rtlsSurvey.group.members', {
                group: groups[level],
                count: groupSize(sketch, level),
              })}
              onDelete={() => onChange(withGroupRemoved(sketch, level))}
            />
          );
        })}
        <TextField
          size='small'
          variant='standard'
          placeholder={t('rtlsSurvey.group.name')}
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
        />
        <Button
          size='small'
          disabled={groupName.trim() === ''}
          onClick={() => {
            onChange(withGroupAdded(sketch, groupName));
            setGroupName('');
          }}
        >
          {t('rtlsSurvey.group.add')}
        </Button>
      </Box>
      <Typography
        data-testid='rtls-survey-explained'
        variant='caption'
        color='textSecondary'
      >
        {t('rtlsSurvey.list.explained')}
      </Typography>
    </Box>
  );
};

export default SurveyAnchorList;
