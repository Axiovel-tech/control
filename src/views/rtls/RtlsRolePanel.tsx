/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure, with inter-anchor TWR telemetry).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import Moon from '@mui/icons-material/NightsStay';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, Tooltip } from '@skybrush/mui-components';

import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsPairedUavStatuses,
  getRtlsSleepPendingMap,
  getRtlsStatsById,
  getRtlsStatsLastUpdatedAt,
  getRtlsTagDevices,
} from '~/features/rtls/selectors';
import {
  sleepAllRtlsDevices,
  sleepRtlsDevice,
  wakeAllRtlsDevices,
  wakeRtlsDevice,
} from '~/features/rtls/sleep-actions';
import { openRtlsOtaDialog, openRtlsParamDialog } from '~/features/rtls/slice';
import { type RtlsDevice } from '~/features/rtls/types';
import Bolt from '~/icons/Bolt';
import type { AppDispatch } from '~/store/reducers';

import DeviceStatsRow, { isSleepableRtlsDevice } from './DeviceStatsRow';

type RowActionsProps = {
  busy: boolean;
  device: RtlsDevice;
  onShowOta: (id: string) => void;
  onShowParameters: (id: string) => void;
  onSleep: (id: string) => void;
  onWake: (id: string) => void;
};

/**
 * The per-row action cluster: sleep / wake (sleepable devices only),
 * parameters and firmware update.
 */
const RowActions = ({
  busy,
  device,
  onShowOta,
  onShowParameters,
  onSleep,
  onWake,
}: RowActionsProps) => (
  <Box sx={{ whiteSpace: 'nowrap' }}>
    {/* Two fixed-intent buttons, like the sleep-all/wake-all pair above the
     * list — deliberately NOT a toggle of the current `sleeping` flag, which
     * may have changed between paint and click and would then invert the
     * user's intent. */}
    {isSleepableRtlsDevice(device) &&
      (busy ? (
        <IconButton size='small' disabled>
          <CircularProgress size={18} color='inherit' />
        </IconButton>
      ) : (
        <>
          <Tooltip content='Sleep'>
            <IconButton size='small' onClick={() => onSleep(device.id)}>
              <Moon fontSize='small' />
            </IconButton>
          </Tooltip>
          <Tooltip content='Wake'>
            <IconButton size='small' onClick={() => onWake(device.id)}>
              <Bolt fontSize='small' />
            </IconButton>
          </Tooltip>
        </>
      ))}
    <Tooltip content='Parameters'>
      <IconButton size='small' onClick={() => onShowParameters(device.id)}>
        <Tune fontSize='small' />
      </IconButton>
    </Tooltip>
    <Tooltip content='Firmware update'>
      <IconButton size='small' onClick={() => onShowOta(device.id)}>
        <SystemUpdate fontSize='small' />
      </IconButton>
    </Tooltip>
  </Box>
);

type RtlsRolePanelProps = {
  variant: 'anchors' | 'tags';
};

const RtlsRolePanel = ({ variant }: RtlsRolePanelProps) => {
  const tags = variant === 'tags';
  const dispatch: AppDispatch = useDispatch();
  const devices = useSelector(tags ? getRtlsTagDevices : getRtlsAnchorDevices);
  const statsById = useSelector(getRtlsStatsById);
  const uavStatuses = useSelector(getRtlsPairedUavStatuses);
  const sleepPending = useSelector(getRtlsSleepPendingMap);
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 1,
          py: 0.5,
        }}
      >
        <OverallRtlsStatusLight />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant='caption' color='textSecondary'>
            {lastUpdatedAt
              ? `updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
              : 'no updates yet'}
          </Typography>
          {tags && (
            <>
              <Tooltip content='Sleep all drones'>
                <IconButton
                  size='small'
                  onClick={() => dispatch(sleepAllRtlsDevices())}
                >
                  <Moon fontSize='small' />
                </IconButton>
              </Tooltip>
              <Tooltip content='Wake all drones'>
                <IconButton
                  size='small'
                  onClick={() => dispatch(wakeAllRtlsDevices())}
                >
                  <Bolt fontSize='small' />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>
      <Divider />
      <Box sx={{ height: '100%', overflow: 'auto' }}>
        {devices.length === 0 ? (
          <BackgroundHint
            text={tags ? 'No RTLS tags' : 'No RTLS anchors'}
          />
        ) : (
          devices.map((device, index) => (
            <Box key={device.id}>
              {index > 0 && <Divider />}
              <DeviceStatsRow
                device={device}
                stats={statsById[device.id]}
                uavStatuses={uavStatuses}
                actions={
                  <RowActions
                    busy={Boolean(sleepPending?.[device.id])}
                    device={device}
                    onShowOta={(id) => dispatch(openRtlsOtaDialog(id))}
                    onShowParameters={(id) =>
                      dispatch(openRtlsParamDialog(id))
                    }
                    onSleep={(id) => dispatch(sleepRtlsDevice(id))}
                    onWake={(id) => dispatch(wakeRtlsDevice(id))}
                  />
                }
              />
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
};

export const RtlsTagsPanel = () => <RtlsRolePanel variant='tags' />;
export const RtlsAnchorsPanel = () => <RtlsRolePanel variant='anchors' />;

export default RtlsRolePanel;
