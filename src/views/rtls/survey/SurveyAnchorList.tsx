/**
 * @file The anchor list of the survey page: who is surveyed, each anchor's
 * height group, and which anchor is the origin and which lies on +x. One
 * action lays out today's standard cell from the anchors' slots.
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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  standardCellSketch,
  withAnchorGroup,
  withAnchorIncluded,
  withGroupAdded,
  withOrigin,
  withXAxis,
} from '~/features/rtls/survey-sketch';

type SurveyAnchorListProps = {
  anchors: RtlsSurveyAnchor[];
  sketch: RtlsSurveySketch;
  onChange: (sketch: RtlsSurveySketch) => void;
};

const SurveyAnchorList = ({
  anchors,
  sketch,
  onChange,
}: SurveyAnchorListProps) => {
  const { t } = useTranslation();
  const [groupName, setGroupName] = useState('');
  const groups = [
    t('rtlsSurvey.group.lower'),
    t('rtlsSurvey.group.upper'),
    ...sketch.groups,
  ];

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
      </Box>
      <Table size='small'>
        <TableHead>
          <TableRow>
            <TableCell padding='checkbox' />
            <TableCell>{t('rtlsSurvey.list.anchor')}</TableCell>
            <TableCell>{t('rtlsSurvey.list.group')}</TableCell>
            <TableCell align='center'>{t('rtlsSurvey.list.origin')}</TableCell>
            <TableCell align='center'>{t('rtlsSurvey.list.xAxis')}</TableCell>
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
                <TableCell>{name}</TableCell>
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
                      <MenuItem key={group} value={level}>
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
                    onChange={() => onChange(withOrigin(sketch, id))}
                  />
                </TableCell>
                <TableCell align='center' padding='none'>
                  <Radio
                    size='small'
                    disabled={!included}
                    checked={sketch.xAxis === id}
                    onChange={() => onChange(withXAxis(sketch, id))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
    </Box>
  );
};

export default SurveyAnchorList;
