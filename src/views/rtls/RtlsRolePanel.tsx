/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure: power, battery and ranging state,
 * with manual sleep/wake).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import Autorenew from '@mui/icons-material/Autorenew';
import FactCheck from '@mui/icons-material/FactCheck';
import Moon from '@mui/icons-material/NightsStay';
import Rule from '@mui/icons-material/Rule';
import UnfoldLess from '@mui/icons-material/UnfoldLess';
import UnfoldMore from '@mui/icons-material/UnfoldMore';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, StatusPill, Tooltip } from '@skybrush/mui-components';

import { getAnchorSlot, getInitiatorMacs } from '~/features/rtls/anchor-utils';
import {
  anchorNamesForCell,
  nameCellAnchors,
} from '~/features/rtls/fleet-health';
import { forgetRtlsDevices } from '~/features/rtls/forget-actions';
import {
  checkGeometryAgreement,
  recalibrateGeometry,
} from '~/features/rtls/geometry-actions';
import {
  describeGeometryAgreement,
  geometryPillFor,
} from '~/features/rtls/geometry-utils';
import AnchorLockControl from '~/features/rtls/AnchorLockControl';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsAnchors,
  getRtlsGeometryCheck,
  getRtlsGeometryInvalidations,
  getRtlsPairedUavStatuses,
  getRtlsSleepPendingMap,
  getRtlsStatsById,
  getRtlsInitiatorEvidence,
  getRtlsLockedOutDeviceIds,
  getRtlsStatsLastUpdatedAt,
  getRtlsTagDevices,
  isRtlsGeometryBusy,
} from '~/features/rtls/selectors';
import { setRtlsSleeping } from '~/features/rtls/sleep-actions';
import {
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
} from '~/features/rtls/slice';
import Bolt from '~/icons/Bolt';
import type { AppDispatch } from '~/store/reducers';

import DeviceStatsRow, { type DeviceRowHandlers } from './DeviceStatsRow';
import { ActionButton } from './row-parts';
import FleetHealthSummary from './FleetHealthSummary';

/** The toolbar's Sleep all / Wake all labels, per panel. */
const TAG_BULK_LABELS = {
  sleep: 'rtlsDevice.action.sleepAllTags',
  wake: 'rtlsDevice.action.wakeAllTags',
};
const ANCHOR_BULK_LABELS = {
  sleep: 'rtlsAnchor.action.sleepAll',
  wake: 'rtlsAnchor.action.wakeAll',
};

/** How often the tags panel silently re-runs the geometry check. */
const GEOMETRY_RECHECK_MS = 10_000;

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
  const lockedOutIds = useSelector(getRtlsLockedOutDeviceIds);
  // a bulk action that would reach a locked anchor is frozen
  const bulkLockedOut = devices.some((device) => lockedOutIds.has(device.id));
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);
  const geometryCheck = useSelector(getRtlsGeometryCheck);
  const geometryBusy = useSelector(isRtlsGeometryBusy);
  const geometrySummary = useMemo(
    () => describeGeometryAgreement(geometryCheck),
    [geometryCheck]
  );
  // names a tag's flagged anchors by system id; one array per cell, so the
  // memoized rows keep a stable prop
  const siteAnchors = useSelector(getRtlsAnchors);
  const anchorNamesByCell = useMemo(
    () => nameCellAnchors(siteAnchors),
    [siteAnchors]
  );
  const initiatorMacs = useMemo(
    () => getInitiatorMacs(siteAnchors),
    [siteAnchors]
  );
  const initiatorEvidence = useSelector(getRtlsInitiatorEvidence);
  const bulkLabels = tags ? TAG_BULK_LABELS : ANCHOR_BULK_LABELS;
  // The tags fit the cell themselves at boot; the panel only asks the
  // server whether the fleet agrees. A cheap, read-only check, so it runs
  // whenever the slice voids a verdict (the tag set changed, a tag
  // rebooted and refitted) and can be repeated at will.
  const invalidations = useSelector(getRtlsGeometryInvalidations);
  const haveTags = devices.length > 0;
  useEffect(() => {
    if (!tags || !haveTags) {
      return undefined;
    }
    // ...and periodically while the panel is open: fits settle, anchors
    // move and tags reboot on their own schedule, so the verdict follows
    // the fleet without a manual check (an in-flight check is skipped).
    void dispatch(checkGeometryAgreement({ silent: true }));
    const timer = setInterval(() => {
      void dispatch(checkGeometryAgreement({ silent: true }));
    }, GEOMETRY_RECHECK_MS);
    return () => clearInterval(timer);
  }, [dispatch, tags, haveTags, invalidations]);
  // Rows show their header line; the ids here also show the rest of their
  // telemetry
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const anyExpanded = devices.some((device) => expanded.has(device.id));
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }, []);
  const rowElements = useRef(new Map<string, HTMLElement>());
  // A drone picked in the health popup: expanded, so that its health lines
  // show why it has its color, and scrolled to the top of the list
  const showDevice = useCallback((id: string) => {
    setExpanded((previous) =>
      previous.has(id) ? previous : new Set(previous).add(id)
    );
    const element = rowElements.current.get(id);
    if (element) {
      window.requestAnimationFrame(() => {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, []);
  // stable identity so the memoized rows are not re-rendered by the parent
  const handlers: DeviceRowHandlers = useMemo(
    () => ({
      onForget: (id) => void dispatch(forgetRtlsDevices([id])),
      onShowOta: (id) => dispatch(openRtlsOtaDialog(id)),
      onShowParameters: (id) => dispatch(openRtlsParamDialog(id)),
      onSleep: (id) => void dispatch(setRtlsSleeping([id], true)),
      onWake: (id) => void dispatch(setRtlsSleeping([id], false)),
    }),
    [dispatch]
  );
  const expandAllButton = (
    <Tooltip
      content={t(
        anyExpanded ? 'rtlsTagDetails.collapseAll' : 'rtlsTagDetails.expandAll'
      )}
    >
      <IconButton
        data-testid={`rtls-${variant}-panel.expand-all`}
        size='small'
        onClick={() =>
          setExpanded(
            anyExpanded
              ? new Set()
              : new Set(devices.map((device) => device.id))
          )
        }
      >
        {anyExpanded ? (
          <UnfoldLess fontSize='small' />
        ) : (
          <UnfoldMore fontSize='small' />
        )}
      </IconButton>
    </Tooltip>
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
              <FleetHealthSummary
                devices={devices}
                statsById={statsById}
                onSelect={showDevice}
              />
              {expandAllButton}
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
              <Tooltip content={t('rtlsGeometry.tooltip.recalibrate')}>
                <IconButton
                  data-testid='rtls-tags-panel.recalibrate-geometry'
                  size='small'
                  disabled={geometryBusy}
                  onClick={() => void dispatch(recalibrateGeometry())}
                >
                  <Autorenew fontSize='small' />
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
          {!tags && expandAllButton}
          {!tags && <AnchorLockControl />}
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
          <ActionButton
            icon={<Moon fontSize='small' />}
            lockedOut={bulkLockedOut}
            testId={`rtls-${variant}-panel.sleep-all`}
            tooltip={t(bulkLabels.sleep)}
            onClick={() => void dispatch(setRtlsSleeping(variant, true))}
          />
          <ActionButton
            icon={<Bolt fontSize='small' />}
            lockedOut={bulkLockedOut}
            testId={`rtls-${variant}-panel.wake-all`}
            tooltip={t(bulkLabels.wake)}
            onClick={() => void dispatch(setRtlsSleeping(variant, false))}
          />
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
              <Box
                key={device.id}
                ref={(element: HTMLElement | null) => {
                  if (element) {
                    rowElements.current.set(device.id, element);
                  } else {
                    rowElements.current.delete(device.id);
                  }
                }}
              >
                {index > 0 && <Divider />}
                <DeviceStatsRow
                  anchorNames={
                    tags
                      ? anchorNamesForCell(anchorNamesByCell, device.cell)
                      : undefined
                  }
                  anchorSlot={
                    tags ? undefined : getAnchorSlot(device, siteAnchors)
                  }
                  initiatorMacs={tags ? undefined : initiatorMacs}
                  initiatorEvidence={initiatorEvidence[device.id]}
                  busy={Boolean(sleepPending?.[device.id])}
                  device={device}
                  expanded={expanded.has(device.id)}
                  geometryLabel={
                    geometry.text
                      ? t(geometry.text.key, geometry.text.values)
                      : undefined
                  }
                  geometryStatus={geometry.status}
                  handlers={handlers}
                  locked={lockedOutIds.has(device.id)}
                  stats={statsById[device.id]}
                  onToggleExpanded={toggleExpanded}
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
