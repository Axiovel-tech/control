/**
 * @file Confirmation dialog of the one-click geometry sync: shows exactly
 * which tags will be rewritten (with their drift summary) and that the
 * rewritten tags reboot, then hands off to the sync thunk.
 */

import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import type { AppDispatch } from '~/store/reducers';

import { syncGeometryToFleet } from './geometry-actions';
import {
  getRtlsGeometryCheck,
  isRtlsGeometrySyncDialogOpen,
} from './selectors';
import { closeRtlsGeometrySyncDialog } from './slice';
import { type RtlsGeometryCheckEntry } from './types';

const describeDrift = (entry: RtlsGeometryCheckEntry): string => {
  switch (entry.status) {
    case 'mismatch': {
      const count = Object.keys(entry.deltas ?? {}).length;
      const missing = entry.missing?.length ?? 0;
      return (
        `${count} parameter(s) differ` +
        (missing > 0 ? `, ${missing} missing` : '')
      );
    }

    case 'incomplete':
      return `${entry.missing?.length ?? 0} parameter(s) missing`;

    case 'error':
      return entry.detail ?? 'not reachable';

    default:
      return 'consistent';
  }
};

const RtlsGeometrySyncDialog = () => {
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsGeometrySyncDialogOpen);
  const check = useSelector(getRtlsGeometryCheck);
  const [reboot, setReboot] = useState(true);

  const drifted = check
    ? Object.entries(check.devices).filter(
        ([, entry]) => entry.status !== 'consistent'
      )
    : [];

  const close = () => dispatch(closeRtlsGeometrySyncDialog());

  return (
    <Dialog open={open} fullWidth maxWidth='xs' onClose={close}>
      <DialogTitle>Sync cell geometry to the fleet</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {check
            ? `The canonical geometry will be written to ` +
              `${drifted.length} out-of-sync tag(s):`
            : 'Run a consistency check first.'}
        </DialogContentText>
        <List dense>
          {drifted.map(([id, entry]) => (
            <ListItem key={id} disableGutters>
              <ListItemText
                primary={`tag ${id}`}
                secondary={describeDrift(entry)}
              />
            </ListItem>
          ))}
        </List>
        <FormControlLabel
          control={
            <Checkbox
              checked={reboot}
              onChange={(event) => setReboot(event.target.checked)}
            />
          }
          label='Reboot rewritten tags (required for the geometry to take
            effect; they drop off the network for a few seconds)'
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          color='primary'
          disabled={!check || drifted.length === 0}
          onClick={() => dispatch(syncGeometryToFleet({ reboot }))}
        >
          {reboot ? 'Write & reboot' : 'Write only'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RtlsGeometrySyncDialog;
