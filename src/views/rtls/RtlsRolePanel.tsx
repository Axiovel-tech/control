/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure, with inter-anchor TWR telemetry).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import Moon from '@mui/icons-material/NightsStay';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React, { useMemo } from 'react';
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
import Bolt from '~/icons/Bolt';
import type { AppDispatch } from '~/store/reducers';

import DeviceStatsRow, { type DeviceRowHandlers } from './DeviceStatsRow';

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
  // stable identity so the memoized rows are not re-rendered by the parent
  const handlers: DeviceRowHandlers = useMemo(
    () => ({
      onShowOta: (id) => dispatch(openRtlsOtaDialog(id)),
      onShowParameters: (id) => dispatch(openRtlsParamDialog(id)),
      onSleep: (id) => dispatch(sleepRtlsDevice(id)),
      onWake: (id) => dispatch(wakeRtlsDevice(id)),
    }),
    [dispatch]
  );

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
          {/* TWR freshness is per-row (each peer carries its age); a global
            * stats timestamp only describes TAG telemetry, so it is only
            * shown on the tags panel */}
          {tags && (
            <Typography variant='caption' color='textSecondary'>
              {lastUpdatedAt
                ? `updated ${new Date(lastUpdatedAt).toLocaleTimeString()}`
                : 'no updates yet'}
            </Typography>
          )}
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
                busy={Boolean(sleepPending?.[device.id])}
                device={device}
                handlers={handlers}
                stats={statsById[device.id]}
                uavStatus={
                  device.uav === undefined
                    ? undefined
                    : uavStatuses?.[device.uav]
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
