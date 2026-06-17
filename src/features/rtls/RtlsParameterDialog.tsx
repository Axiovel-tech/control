/**
 * @file Per-device parameter viewer/editor dialog driven by X-RTLS-PARAM-LIST
 * (read-only listing) and X-RTLS-PARAM-SET (inline single-parameter editing).
 */

import Refresh from '@mui/icons-material/Refresh';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import IconButton from '@mui/material/IconButton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, DraggableDialog } from '@skybrush/mui-components';

import { showError, showNotification } from '~/features/snackbar/actions';
import { type AppDispatch, type RootState } from '~/store/reducers';

import {
  fetchRtlsDeviceParameters,
  setRtlsDeviceParameter,
} from './param-actions';
import { coerceParamValue, formatParamValue } from './param-formatting';
import {
  getRtlsParamDialogDeviceId,
  getRtlsParamsStateForDevice,
  isRtlsParamDialogOpen,
} from './selectors';
import { closeRtlsParamDialog } from './slice';
import { type RtlsParam } from './types';

type ParameterRowProps = {
  deviceId: string;
  param: RtlsParam;
};

const ParameterRow = ({ deviceId, param }: ParameterRowProps) => {
  const dispatch = useDispatch<AppDispatch>();
  const [draft, setDraft] = useState<string>(
    formatParamValue(param.value, param.type)
  );
  const [busy, setBusy] = useState(false);

  // Keep the editor in sync when the cached value changes underneath us.
  useEffect(() => {
    setDraft(formatParamValue(param.value, param.type));
  }, [param.value, param.type]);

  const dirty = draft !== formatParamValue(param.value, param.type);

  const handleCommit = useCallback(async () => {
    if (!dirty || busy) {
      return;
    }

    let value;
    try {
      value = coerceParamValue(draft, param.type);
    } catch (error) {
      showError(`Invalid value for ${param.name}: ${String(error)}`);
      return;
    }

    setBusy(true);
    try {
      const result = await dispatch(
        setRtlsDeviceParameter(deviceId, param.name, value, param.type)
      );
      if (result.accepted) {
        showNotification(`${param.name} updated`);
      } else {
        showError(
          `${param.name} rejected by device${
            result.result ? `: ${result.result}` : ''
          }`
        );
        // Revert the editor to the last known good value.
        setDraft(formatParamValue(param.value, param.type));
      }
    } catch (error) {
      showError(`Failed to set ${param.name}: ${String(error)}`);
    } finally {
      setBusy(false);
    }
  }, [busy, deviceId, dirty, dispatch, draft, param]);

  return (
    <TableRow>
      <TableCell>{param.name}</TableCell>
      <TableCell>{param.type}</TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant='standard'
          size='small'
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleCommit();
            }
          }}
        />
      </TableCell>
      <TableCell align='right'>
        <Button
          size='small'
          disabled={!dirty || busy}
          onClick={() => void handleCommit()}
        >
          Set
        </Button>
      </TableCell>
    </TableRow>
  );
};

const RtlsParameterDialog = () => {
  const dispatch = useDispatch<AppDispatch>();
  const open = useSelector(isRtlsParamDialogOpen);
  const deviceId = useSelector(getRtlsParamDialogDeviceId);
  const paramsState = useSelector((state: RootState) =>
    deviceId ? getRtlsParamsStateForDevice(state, deviceId) : undefined
  );

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

  const status = paramsState?.status ?? 'idle';
  const params = paramsState?.params ?? [];

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
        {status === 'error' ? (
          <BackgroundHint
            text={`Failed to load parameters: ${paramsState?.error ?? 'unknown error'}`}
          />
        ) : status === 'loading' && params.length === 0 ? (
          <BackgroundHint text='Loading parameters…' />
        ) : params.length === 0 ? (
          <BackgroundHint text='No parameters' />
        ) : (
          <Box sx={{ maxHeight: 480, overflow: 'auto' }}>
            <Table size='small' stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Value</TableCell>
                  <TableCell align='right' />
                </TableRow>
              </TableHead>
              <TableBody>
                {params.map((param) => (
                  <ParameterRow
                    key={param.name}
                    deviceId={deviceId!}
                    param={param}
                  />
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
        <DialogActions>
          <Button onClick={handleClose}>Close</Button>
        </DialogActions>
      </DialogContent>
    </DraggableDialog>
  );
};

export default RtlsParameterDialog;
