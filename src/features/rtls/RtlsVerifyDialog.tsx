/**
 * @file The fleet pre-flight verification dialog: runs the X-RTLS-VERIFY
 * rule set and renders the per-rule verdicts with their severity, plus the
 * opt-in in-depth ArduPilot parameter pass for pedantic days.
 */

import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { StatusLight, StatusPill } from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import type { AppDispatch } from '~/store/reducers';

import {
  getRtlsVerifyResult,
  isRtlsVerifyDialogOpen,
  isRtlsVerifyRunning,
} from './selectors';
import { closeRtlsVerifyDialog } from './slice';
import { type RtlsVerifyRule } from './types';
import { runFleetVerification } from './verify-actions';

const statusOfRule = (rule: RtlsVerifyRule): Status => {
  if (rule.status === 'pass') {
    return Status.SUCCESS;
  }
  if (rule.status === 'skipped') {
    return Status.OFF;
  }
  return rule.severity === 'error' ? Status.ERROR : Status.WARNING;
};

const RtlsVerifyDialog = () => {
  const dispatch: AppDispatch = useDispatch();
  const open = useSelector(isRtlsVerifyDialogOpen);
  const running = useSelector(isRtlsVerifyRunning);
  const result = useSelector(getRtlsVerifyResult);
  const [inDepth, setInDepth] = useState(false);

  // opening the dialog runs the standard verification right away — that IS
  // the action the operator asked for by clicking Verify. It runs on EVERY
  // open: showing a verdict from an earlier session as if it were current
  // would be a stale pre-flight pass.
  useEffect(() => {
    if (open && !running) {
      void dispatch(runFleetVerification({ inDepth: false }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => dispatch(closeRtlsVerifyDialog());

  return (
    <Dialog open={open} fullWidth maxWidth='sm' onClose={close}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        Fleet verification
        {result && !running && (
          <StatusPill
            inline
            status={result.passed ? Status.SUCCESS : Status.ERROR}
          >
            {result.passed ? 'pass' : 'blocked'}
          </StatusPill>
        )}
      </DialogTitle>
      <DialogContent>
        {running && (
          <Typography
            variant='body2'
            sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}
          >
            <CircularProgress size={16} /> verifying the fleet…
          </Typography>
        )}
        {result && (
          <List dense>
            {result.rules.map((rule) => (
              <ListItem key={rule.id} disableGutters alignItems='flex-start'>
                <ListItemIcon sx={{ minWidth: 32, mt: 0.5 }}>
                  <StatusLight status={statusOfRule(rule)} />
                </ListItemIcon>
                <ListItemText
                  primary={
                    rule.label +
                    (rule.status === 'fail' && rule.severity === 'warning'
                      ? ' (warning)'
                      : '')
                  }
                  secondary={rule.detail}
                />
              </ListItem>
            ))}
          </List>
        )}
        {result && (
          <Typography variant='caption' color='textSecondary'>
            {`verified ${new Date(result.receivedAt).toLocaleTimeString()}` +
              (result.inDepth ? ' · in-depth' : '')}
          </Typography>
        )}
        <FormControlLabel
          control={
            <Checkbox
              checked={inDepth}
              disabled={running}
              onChange={(event) => setInDepth(event.target.checked)}
            />
          }
          label='In-depth: also compare the ArduPilot navigation/tuning
            parameters across all drones (slower; differences are warnings)'
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Close</Button>
        <Button
          color='primary'
          disabled={running}
          onClick={() => void dispatch(runFleetVerification({ inDepth }))}
        >
          Run again
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RtlsVerifyDialog;
