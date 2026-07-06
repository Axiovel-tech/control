/**
 * @file Single editable parameter row of the RTLS parameter dialog: inline
 * value editing over X-RTLS-PARAM-SET, decorated with the static client-side
 * metadata (description, unit, enum labels, bounds) when available.
 */

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { memo, useCallback, useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';

import { TooltipWithContainerFromContext as Tooltip } from '~/containerContext';
import { showError, showNotification } from '~/features/snackbar/actions';
import { type AppDispatch } from '~/store/reducers';

import { setRtlsDeviceParameter } from './param-actions';
import { coerceParamValue, formatParamValue } from './param-formatting';
import { getRtlsParamMetadata, type RtlsParamMetadata } from './param-metadata';
import { type RtlsParam } from './types';

/**
 * Returns the enum label of the given draft (or committed) value, if the
 * parameter is enum-valued and the value has a label.
 */
const enumLabelFor = (
  metadata: RtlsParamMetadata | undefined,
  draft: string
): string | undefined => {
  if (!metadata?.enumLabels) {
    return undefined;
  }

  // Number('') is 0, which would show the label of wire value 0 under an
  // emptied editor — treat a blank draft as "no value" instead.
  const trimmed = draft.trim();
  if (!trimmed) {
    return undefined;
  }

  const value = Number(trimmed);
  return Number.isInteger(value) ? metadata.enumLabels[value] : undefined;
};

/** Full metadata tooltip: description plus enum table, range and default. */
const MetadataTooltipContent = ({
  metadata,
}: {
  metadata: RtlsParamMetadata;
}) => (
  <>
    <div>{metadata.description}</div>
    {metadata.enumLabels && (
      <div>
        {Object.entries(metadata.enumLabels)
          .map(([value, label]) => `${value} = ${label}`)
          .join(', ')}
      </div>
    )}
    {(metadata.min !== undefined || metadata.max !== undefined) && (
      <div>
        Range: {metadata.min ?? '−∞'} … {metadata.max ?? '∞'}
        {metadata.unit ? ` ${metadata.unit}` : ''}
      </div>
    )}
    {metadata.defaultValue !== undefined && (
      <div>Default: {metadata.defaultValue}</div>
    )}
  </>
);

type RtlsParameterRowProps = {
  deviceId: string;
  param: RtlsParam;
};

const RtlsParameterRow = ({ deviceId, param }: RtlsParameterRowProps) => {
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
  const metadata = getRtlsParamMetadata(param.name);
  const enumLabel = enumLabelFor(metadata, draft);

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

  const nameCell = (
    <Box>
      <Typography variant='body2'>{param.name}</Typography>
      {metadata && (
        <Typography
          noWrap
          display='block'
          variant='caption'
          color='text.secondary'
          maxWidth={300}
        >
          {metadata.description}
        </Typography>
      )}
    </Box>
  );

  return (
    <TableRow>
      <TableCell>
        {metadata ? (
          <Tooltip content={<MetadataTooltipContent metadata={metadata} />}>
            {nameCell}
          </Tooltip>
        ) : (
          nameCell
        )}
      </TableCell>
      <TableCell>{param.type}</TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant='standard'
          size='small'
          value={draft}
          disabled={busy}
          slotProps={{
            input: {
              endAdornment: metadata?.unit ? (
                <InputAdornment position='end'>{metadata.unit}</InputAdornment>
              ) : undefined,
            },
          }}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void handleCommit();
            }
          }}
        />
        {enumLabel && (
          <Typography variant='caption' color='text.secondary'>
            = {enumLabel}
          </Typography>
        )}
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

// Memoized: the dialog re-renders on every search keystroke and collapse
// toggle, and the row props (deviceId, the param object from the cached
// Redux array) are referentially stable across those renders.
export default memo(RtlsParameterRow);
