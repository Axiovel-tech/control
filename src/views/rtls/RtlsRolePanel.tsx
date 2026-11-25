/**
 * @file The two top-level RTLS workbench panels: "RTLS Tags" (per-drone tags,
 * shown UAV-style with their solve telemetry and sleep/wake actions) and
 * "RTLS Anchors" (the site infrastructure: power, battery and ranging state,
 * with manual sleep/wake).
 * These replace the old drawer-tucked "RTLS Link" panel: tags are a
 * pre-flight surface, anchors a site-setup surface, so each gets its own tab
 * next to Map / UAVs / 3D View.
 */

import FactCheck from '@mui/icons-material/FactCheck';
import Moon from '@mui/icons-material/NightsStay';
import UnfoldLess from '@mui/icons-material/UnfoldLess';
import UnfoldMore from '@mui/icons-material/UnfoldMore';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';

import { BackgroundHint, StatusPill, Tooltip } from '@skybrush/mui-components';

import {
  getAnchorSlot,
  getInitiatorMacs,
  isAnchorSwitching,
} from '~/features/rtls/anchor-utils';
import { forgetRtlsDevices } from '~/features/rtls/forget-actions';
import AnchorLockControl from '~/features/rtls/AnchorLockControl';
import CellSettingsControl from '~/features/rtls/CellSettingsControl';
import OverallRtlsStatusLight from '~/features/rtls/OverallRtlsStatusLight';
import {
  getRtlsAnchorDevices,
  getRtlsAnchorPowerRequests,
  getRtlsAnchors,
  getRtlsCellSurvey,
  getRtlsPairedUavStatuses,
  getRtlsSleepPendingMap,
  getRtlsStatsById,
  getRtlsInitiatorEvidence,
  getRtlsLockedOutDeviceIds,
  getRtlsStatsLastUpdatedAt,
  getRtlsTagDevices,
  isRtlsSurveyPlanar,
} from '~/features/rtls/selectors';
import { setRtlsSleeping } from '~/features/rtls/sleep-actions';
import {
  openRtlsOtaDialog,
  openRtlsParamDialog,
  openRtlsVerifyDialog,
} from '~/features/rtls/slice';
import {
  describeAnchorSurveyChip,
  describeCellSurveyPill,
  describeTagSurveyChip,
  describeTagSurveyPill,
  tableAnchorNamer,
} from '~/features/rtls/survey-health';
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
  const anchorPowerRequests = useSelector(getRtlsAnchorPowerRequests);
  const lockedOutIds = useSelector(getRtlsLockedOutDeviceIds);
  // a bulk action that would reach a locked anchor is frozen
  const bulkLockedOut = devices.some((device) => lockedOutIds.has(device.id));
  const lastUpdatedAt = useSelector(getRtlsStatsLastUpdatedAt);
  // the anchors own the geometry: the panels only show which survey the
  // cell is on and who is off it, as the server reports it
  const cellSurvey = useSelector(getRtlsCellSurvey);
  const siteAnchors = useSelector(getRtlsAnchors);
  // with every surveyed anchor planar, three are enough for a tag to
  // position: the pills, the rows and the pre-show health go by one answer
  const planarSurvey = useSelector(isRtlsSurveyPlanar);
  const surveyPill = useMemo(
    () =>
      tags
        ? describeTagSurveyPill(cellSurvey, devices, statsById, planarSurvey)
        : describeCellSurveyPill(cellSurvey),
    [cellSurvey, devices, planarSurvey, statsById, tags]
  );
  // names the anchors of a tag's own table; stable, so the memoized rows
  // keep their prop
  const nameTableAnchor = useMemo(
    () => tableAnchorNamer(siteAnchors),
    [siteAnchors]
  );
  const initiatorMacs = useMemo(
    () => getInitiatorMacs(siteAnchors),
    [siteAnchors]
  );
  const initiatorEvidence = useSelector(getRtlsInitiatorEvidence);
  const bulkLabels = tags ? TAG_BULK_LABELS : ANCHOR_BULK_LABELS;
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
          {surveyPill && (
            <StatusPill
              inline
              data-testid={`rtls-${variant}-panel.survey`}
              status={surveyPill.status}
            >
              {t(surveyPill.text.key, surveyPill.text.values)}
            </StatusPill>
          )}
          {tags && (
            <>
              <FleetHealthSummary
                devices={devices}
                statsById={statsById}
                planarSurvey={planarSurvey}
                onSelect={showDevice}
              />
              {expandAllButton}
              <Tooltip content={t('rtlsVerify.tooltip')}>
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
          {!tags && <CellSettingsControl />}
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
            const stats = statsById[device.id];
            const survey = tags
              ? describeTagSurveyChip(device, stats, planarSurvey)
              : describeAnchorSurveyChip(
                  device,
                  stats,
                  siteAnchors.find(
                    (anchor) => String(anchor.systemId) === device.id
                  ),
                  cellSurvey
                );
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
                  nameTableAnchor={tags ? nameTableAnchor : undefined}
                  planarSurvey={planarSurvey}
                  anchorSlot={
                    tags ? undefined : getAnchorSlot(device, siteAnchors)
                  }
                  initiatorMacs={tags ? undefined : initiatorMacs}
                  initiatorEvidence={initiatorEvidence[device.id]}
                  busy={
                    tags
                      ? Boolean(sleepPending?.[device.id])
                      : isAnchorSwitching(
                          device,
                          anchorPowerRequests[device.id]
                        )
                  }
                  device={device}
                  expanded={expanded.has(device.id)}
                  surveyLabel={survey && t(survey.text.key, survey.text.values)}
                  surveyStatus={survey?.status}
                  surveyTooltip={
                    survey?.tooltip &&
                    t(survey.tooltip.key, survey.tooltip.values)
                  }
                  handlers={handlers}
                  locked={lockedOutIds.has(device.id)}
                  stats={stats}
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
