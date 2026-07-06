/**
 * @file Per-device parameter viewer/editor dialog driven by X-RTLS-PARAM-LIST
 * (read-only listing) and X-RTLS-PARAM-SET (inline single-parameter editing).
 *
 * Parameters are organized into collapsible groups derived from the firmware
 * naming convention (UWB, WIFI, SIM, ...) and can be filtered by a free-text
 * search over names and descriptions. While a search is active, expansion is
 * derived from the matches (groups with hits expand, the rest dim).
 */

import ChevronRight from '@mui/icons-material/ChevronRight';
import Clear from '@mui/icons-material/Clear';
import ExpandMore from '@mui/icons-material/ExpandMore';
import Refresh from '@mui/icons-material/Refresh';
import Search from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, DraggableDialog } from '@skybrush/mui-components';

import { type AppDispatch, type RootState } from '~/store/reducers';

import { fetchRtlsDeviceParameters } from './param-actions';
import {
  getRtlsParamGroupLabel,
  groupRtlsParams,
  matchesRtlsParamFilter,
} from './param-grouping';
import RtlsParameterRow from './RtlsParameterRow';
import {
  getRtlsParamDialogDeviceId,
  getRtlsParamsStateForDevice,
  isRtlsParamDialogOpen,
} from './selectors';
import { closeRtlsParamDialog } from './slice';

type GroupHeaderRowProps = {
  label: string;
  total: number;
  matchCount: number;
  searching: boolean;
  expanded: boolean;
  onToggle: () => void;
};

const GroupHeaderRow = ({
  label,
  total,
  matchCount,
  searching,
  expanded,
  onToggle,
}: GroupHeaderRowProps) => (
  <TableRow hover>
    <TableCell
      colSpan={4}
      sx={{
        p: 0,
        bgcolor: 'action.hover',
        opacity: searching && matchCount === 0 ? 0.5 : 1,
      }}
    >
      <ButtonBase
        disabled={searching}
        aria-expanded={expanded}
        sx={{
          width: '100%',
          justifyContent: 'flex-start',
          px: 2,
          py: 0.5,
          gap: 1,
        }}
        onClick={onToggle}
      >
        {expanded ? (
          <ExpandMore fontSize='small' />
        ) : (
          <ChevronRight fontSize='small' />
        )}
        <Typography variant='subtitle2'>{label}</Typography>
        <Typography variant='caption' color='text.secondary'>
          {searching ? `${matchCount} of ${total}` : total}
        </Typography>
      </ButtonBase>
    </TableCell>
  </TableRow>
);

const RtlsParameterDialog = () => {
  const dispatch = useDispatch<AppDispatch>();
  const open = useSelector(isRtlsParamDialogOpen);
  const deviceId = useSelector(getRtlsParamDialogDeviceId);
  const paramsState = useSelector((state: RootState) =>
    deviceId ? getRtlsParamsStateForDevice(state, deviceId) : undefined
  );

  const [searchText, setSearchText] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    new Set()
  );

  // The dialog stays mounted across openings; reset the search and collapse
  // state whenever it is (re)opened or retargeted to another device.
  useEffect(() => {
    setSearchText('');
    setCollapsedGroups(new Set());
  }, [open, deviceId]);

  // Fetch the parameter list when the dialog opens for a device that has no
  // cached list yet.
  useEffect(() => {
    if (open && deviceId && paramsState === undefined) {
      void dispatch(fetchRtlsDeviceParameters(deviceId));
    }
  }, [open, deviceId, paramsState, dispatch]);

  const handleRefresh = useCallback(() => {
    if (deviceId) {
      void dispatch(fetchRtlsDeviceParameters(deviceId));
    }
  }, [deviceId, dispatch]);

  const handleClose = useCallback(() => {
    dispatch(closeRtlsParamDialog());
  }, [dispatch]);

  const handleToggleGroup = useCallback((key: string) => {
    setCollapsedGroups((collapsed) => {
      const next = new Set(collapsed);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }, []);

  const status = paramsState?.status ?? 'idle';
  const params = paramsState?.params ?? [];

  // `hasText` gates the editor chrome (clear adornment, Escape-clears);
  // `query`/`searching` gate the actual filtering, so whitespace-only input
  // is still clearable but does not filter.
  const hasText = searchText.length > 0;
  const query = searchText.trim();
  const searching = query.length > 0;
  const grouped = useMemo(() => groupRtlsParams(params), [params]);
  const filteredGroups = useMemo(
    () =>
      grouped.map((group) => ({
        key: group.key,
        label: getRtlsParamGroupLabel(group.key),
        total: group.params.length,
        matches: query
          ? group.params.filter((param) => matchesRtlsParamFilter(param, query))
          : group.params,
      })),
    [grouped, query]
  );
  const matchCount = filteredGroups.reduce(
    (sum, group) => sum + group.matches.length,
    0
  );

  return (
    <DraggableDialog
      fullWidth
      open={open}
      maxWidth='md'
      title={deviceId ? `Parameters of device ${deviceId}` : 'Parameters'}
      onClose={handleClose}
      titleComponents={
        <IconButton
          disabled={!deviceId || status === 'loading'}
          onClick={handleRefresh}
        >
          <Refresh />
        </IconButton>
      }
    >
      <DialogContent>
        {status === 'error' && params.length === 0 ? (
          // A failed refresh keeps the previously fetched list in the cache
          // (see rtlsParamsFetchFailed) — only a failure with nothing cached
          // replaces the table with the error hint.
          <BackgroundHint
            text={`Failed to load parameters: ${paramsState?.error ?? 'unknown error'}`}
          />
        ) : status === 'loading' && params.length === 0 ? (
          <BackgroundHint text='Loading parameters…' />
        ) : params.length === 0 ? (
          <BackgroundHint text='No parameters' />
        ) : (
          <>
            <TextField
              fullWidth
              autoFocus
              size='small'
              placeholder='Search parameters…'
              value={searchText}
              sx={{ mb: 1 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <Search fontSize='small' />
                    </InputAdornment>
                  ),
                  endAdornment: hasText ? (
                    <InputAdornment position='end'>
                      <IconButton
                        size='small'
                        aria-label='Clear search'
                        onClick={() => setSearchText('')}
                      >
                        <Clear fontSize='small' />
                      </IconButton>
                    </InputAdornment>
                  ) : undefined,
                },
              }}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  // Never let Enter fall through to a row commit.
                  event.preventDefault();
                } else if (event.key === 'Escape' && hasText) {
                  // First Escape clears the search; only an empty search
                  // lets Escape bubble up and close the dialog.
                  event.stopPropagation();
                  setSearchText('');
                }
              }}
            />
            {searching && matchCount === 0 ? (
              <Box py={4}>
                <BackgroundHint
                  text={`No parameters match “${query}”`}
                  button={
                    <Button onClick={() => setSearchText('')}>
                      Clear filter
                    </Button>
                  }
                />
              </Box>
            ) : (
              <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
                <Table size='small'>
                  <TableBody>
                    {filteredGroups.map((group) => {
                      // While searching, expansion is derived from the
                      // matches; manual toggles apply only to browsing.
                      const expanded = searching
                        ? group.matches.length > 0
                        : !collapsedGroups.has(group.key);
                      return [
                        // The `group:` prefix keeps the header key disjoint
                        // from row keys — an underscore-less param name IS
                        // its own group key.
                        <GroupHeaderRow
                          key={`group:${group.key}`}
                          label={group.label}
                          total={group.total}
                          matchCount={group.matches.length}
                          searching={searching}
                          expanded={expanded}
                          onToggle={() => handleToggleGroup(group.key)}
                        />,
                        ...(expanded
                          ? group.matches.map((param) => (
                              <RtlsParameterRow
                                key={param.name}
                                // deviceId is set whenever params exist:
                                // the table only renders for a fetched
                                // device.
                                deviceId={deviceId!}
                                param={param}
                              />
                            ))
                          : []),
                      ];
                    })}
                  </TableBody>
                </Table>
              </Box>
            )}
          </>
        )}
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </DialogContent>
    </DraggableDialog>
  );
};

export default RtlsParameterDialog;
