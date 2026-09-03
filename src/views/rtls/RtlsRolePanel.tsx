/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure, with inter-anchor TWR telemetry).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import FactCheck from '@mui/icons-material/FactCheck';
import Moon from '@mui/icons-material/NightsStay';
import Rule from '@mui/icons-material/Rule';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, StatusPill, Tooltip } from '@skybrush/mui-components';

import { checkGeometryAgreement } from '~/features/rtls/geometry-actions';
import {
  describeGeometryAgreement,
  geometryPillFor,
} from '~/features/rtls/geometry-utils';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsGeometryCheck,
  getRtlsGeometryInvalidations,
  getRtlsPairedUavStatuses,
  hasRtlsGeometryDriftAlarm,
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
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
} from '~/features/rtls/slice';
import Bolt from '~/icons/Bolt';
import type { AppDispatch } from '~/store/reducers';

import DeviceStatsRow, { type DeviceRowHandlers } from './DeviceStatsRow';

type RtlsRolePanelProps = {
  variant: 'anchors' | 'tags';
};

const RtlsRolePanel = ({ variant }: RtlsRolePanelProps) => {
  const { t } = useTranslation();
  const tags = variant === 'tags';
  const dispatch: AppDispatch = useDispatch();
  const devices = useSelector(tags ? getRtlsTagDevices : getRtlsAnchorDevices);
  const statsById = useSelector(getRtlsStatsById);
  const uavStatuses = useSelector(getRtlsPairedUavStatuses);
  const sleepPending = useSelector(getRtlsSleepPendingMap);
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);
  const geometryCheck = useSelector(getRtlsGeometryCheck);
  const geometryBusy = useSelector(isRtlsGeometryBusy);
  const geometrySummary = useMemo(
    () => describeGeometryAgreement(geometryCheck),
    [geometryCheck]
  );
  // The tags fit the cell themselves at boot; the panel only asks the
  // server whether the fleet agrees. A cheap, read-only check, so it runs
  // whenever the slice voids a verdict (the tag set changed, a tag
  // rebooted and refitted) and can be repeated at will.
  const invalidations = useSelector(getRtlsGeometryInvalidations);
  // ...and when a certified tag's live drift crosses the verdict's
  // tolerance (an anchor moved after the check): the server then grades
  // it 'drifted' instead of the pill keeping a stale 'ok'.
  const driftAlarm = useSelector(hasRtlsGeometryDriftAlarm);
  const haveTags = devices.length > 0;
  useEffect(() => {
    if (tags && haveTags) {
      void dispatch(checkGeometryAgreement({ silent: true }));
    }
  }, [dispatch, tags, haveTags, invalidations, driftAlarm]);
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
    <Box
      data-testid={tags ? 'rtls-tags-panel' : 'rtls-anchors-panel'}
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
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
          <OverallRtlsStatusLight scope={tags ? 'tags' : 'anchors'} />
          {tags && (
            <>
              {geometryBusy ? (
                <CircularProgress size={16} />
              ) : (
                <StatusPill
                  inline
                  data-testid='rtls-tags-panel.geometry'
                  status={geometrySummary.status}
                >
                  {t(geometrySummary.key, geometrySummary.values)}
                </StatusPill>
              )}
              <Tooltip content={t('rtlsGeometry.tooltip.check')}>
                <IconButton
                  data-testid='rtls-tags-panel.check-geometry'
                  size='small'
                  disabled={geometryBusy}
                  onClick={() => void dispatch(checkGeometryAgreement())}
                >
                  <Rule fontSize='small' />
                </IconButton>
              </Tooltip>
              <Tooltip content={t('rtlsGeometry.tooltip.verify')}>
                <IconButton
                  data-testid='rtls-tags-panel.verify'
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
                  onClick={() => void dispatch(sleepAllRtlsDevices())}
                >
                  <Moon fontSize='small' />
                </IconButton>
              </Tooltip>
              <Tooltip content='Wake all drones'>
                <IconButton
                  size='small'
                  onClick={() => void dispatch(wakeAllRtlsDevices())}
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
          <BackgroundHint text={tags ? 'No RTLS tags' : 'No RTLS anchors'} />
        ) : (
          devices.map((device, index) => {
            const geometry = tags
              ? geometryPillFor(
                  statsById[device.id],
                  geometryCheck?.devices[device.id]
                )
              : {};
            return (
              <Box key={device.id}>
                {index > 0 && <Divider />}
                <DeviceStatsRow
                  busy={Boolean(sleepPending?.[device.id])}
                  device={device}
                  geometryLabel={
                    geometry.text
                      ? t(geometry.text.key, geometry.text.values)
                      : undefined
                  }
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
