/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure, with inter-anchor TWR telemetry).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import Architecture from '@mui/icons-material/Architecture';
import BookmarkAdd from '@mui/icons-material/BookmarkAdd';
import FactCheck from '@mui/icons-material/FactCheck';
import Moon from '@mui/icons-material/NightsStay';
import Rule from '@mui/icons-material/Rule';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React, { useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, StatusPill, Tooltip } from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import {
  adoptGeometryFromFleet,
  checkGeometryConsistency,
} from '~/features/rtls/geometry-actions';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsGeometryCheck,
  getRtlsGeometryDriftCount,
  getRtlsGeometryPendingReboot,
  getRtlsPairedUavStatuses,
  getRtlsSleepPendingMap,
  getRtlsStatsById,
  getRtlsStatsLastUpdatedAt,
  getRtlsTagDevices,
  isRtlsGeometryBusy,
} from '~/features/rtls/selectors';
import {
  sleepAllRtlsDevices,
  sleepRtlsDevice,
  wakeAllRtlsDevices,
  wakeRtlsDevice,
} from '~/features/rtls/sleep-actions';
import {
  openRtlsCalibrationWizard,
  openRtlsGeometrySyncDialog,
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
} from '~/features/rtls/slice';
import { type RtlsGeometryCheck } from '~/features/rtls/types';
import Bolt from '~/icons/Bolt';
import type { AppDispatch } from '~/store/reducers';

import DeviceStatsRow, { type DeviceRowHandlers } from './DeviceStatsRow';

/**
 * The geometry-consistency pill of one tag row, derived from the last
 * X-RTLS-GEO check: the reference tag is marked as such, targets carry
 * their verdict. No pill before the first check.
 */
const geometryPillFor = (
  deviceId: string,
  check: RtlsGeometryCheck | undefined,
  pendingReboot: Record<string, true>
): { label?: string; status?: Status } => {
  if (pendingReboot[deviceId]) {
    // the registry says "consistent" but the solver still runs on the
    // OLD geometry until the tag reboots
    return { label: 'geometry pending reboot', status: Status.WARNING };
  }
  if (!check) {
    return {};
  }
  const entry = check.devices[deviceId];
  if (!entry) {
    return {};
  }
  switch (entry.status) {
    case 'consistent':
      return { label: 'geometry ok', status: Status.SUCCESS };
    case 'mismatch':
      return {
        label: `geometry drift (${Object.keys(entry.deltas ?? {}).length})`,
        status: Status.ERROR,
      };
    case 'incomplete':
      return { label: 'geometry incomplete', status: Status.WARNING };
    default:
      return { label: 'geometry error', status: Status.ERROR };
  }
};

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
  const geometryCheck = useSelector(getRtlsGeometryCheck);
  const geometryDrift = useSelector(getRtlsGeometryDriftCount);
  const pendingReboot = useSelector(getRtlsGeometryPendingReboot);
  const pendingRebootCount = Object.keys(pendingReboot).length;
  const geometryBusy = useSelector(isRtlsGeometryBusy);
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <OverallRtlsStatusLight />
          {!tags && (
            <Tooltip content='Calibrate the anchor geometry from live TWR'>
              <Button
                size='small'
                startIcon={<Architecture fontSize='small' />}
                onClick={() => dispatch(openRtlsCalibrationWizard())}
              >
                Calibrate…
              </Button>
            </Tooltip>
          )}
          {tags && (
            <>
              {geometryBusy ? (
                <CircularProgress size={16} />
              ) : geometryCheck ? (
                <StatusPill
                  inline
                  status={
                    geometryDrift > 0
                      ? Status.ERROR
                      : pendingRebootCount > 0
                        ? Status.WARNING
                        : Status.SUCCESS
                  }
                >
                  {geometryDrift > 0
                    ? `geometry: ${geometryDrift} out of sync`
                    : pendingRebootCount > 0
                      ? `geometry: ${pendingRebootCount} pending reboot`
                      : 'geometry consistent'}
                </StatusPill>
              ) : (
                <StatusPill inline status={Status.OFF}>
                  geometry unchecked
                </StatusPill>
              )}
              <Tooltip content='Check geometry consistency'>
                <IconButton
                  size='small'
                  disabled={geometryBusy}
                  onClick={() => dispatch(checkGeometryConsistency())}
                >
                  <Rule fontSize='small' />
                </IconButton>
              </Tooltip>
              <Tooltip
                content='Adopt the current fleet geometry as canonical
                  (refused unless the fleet is unanimous)'
              >
                <IconButton
                  size='small'
                  disabled={geometryBusy}
                  onClick={() => dispatch(adoptGeometryFromFleet())}
                >
                  <BookmarkAdd fontSize='small' />
                </IconButton>
              </Tooltip>
              <Button
                size='small'
                disabled={
                  geometryBusy || !geometryCheck || geometryDrift === 0
                }
                onClick={() => dispatch(openRtlsGeometrySyncDialog())}
              >
                Sync…
              </Button>
              <Tooltip content='Run the fleet pre-flight verification'>
                <IconButton
                  size='small'
                  onClick={() => dispatch(openRtlsVerifyDialog())}
                >
                  <FactCheck fontSize='small' />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
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
          devices.map((device, index) => {
            const geometry = tags
              ? geometryPillFor(device.id, geometryCheck, pendingReboot)
              : {};
            return (
              <Box key={device.id}>
                {index > 0 && <Divider />}
                <DeviceStatsRow
                  busy={Boolean(sleepPending?.[device.id])}
                  device={device}
                  geometryLabel={geometry.label}
                  geometryStatus={geometry.status}
                  handlers={handlers}
                  stats={statsById[device.id]}
                  uavStatus={
                    device.uav === undefined
                      ? undefined
                      : uavStatuses?.[device.uav]
                  }
                />
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
};

export const RtlsTagsPanel = () => <RtlsRolePanel variant='tags' />;
export const RtlsAnchorsPanel = () => <RtlsRolePanel variant='anchors' />;

export default RtlsRolePanel;
