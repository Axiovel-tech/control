/**
 * @file One merged row of an RTLS role panel: status light, name, paired-drone
 * pill, per-role telemetry on the header line (a tag's solve rate and
 * percentage; an anchor's slot, state, ranging figures, warnings, input and
 * battery), the rest behind "show more", and an actions slot — the single
 * place a device's state is shown, so the tag/anchor panels need no separate
 * "health" view.
 */

import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Moon from '@mui/icons-material/NightsStay';
import SystemUpdate from '@mui/icons-material/SystemUpdate';
import Tune from '@mui/icons-material/Tune';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { StatusLight, StatusPill, Tooltip } from '@skybrush/mui-components';

import { Status } from '~/components/semantics';
import { isDeviceLost } from '~/features/rtls/anchor-utils';
import { getStatusForHealth } from '~/features/rtls/health-status';
import {
  classifyRole,
  getDeviceHealthForRole,
  type InitiatorEvidence,
  isAnchorRole,
  type RtlsRole,
  type RtlsTagCell,
} from '~/features/rtls/stats-utils';
import { type TableAnchorNamer } from '~/features/rtls/survey-health';
import { type RtlsDevice, type RtlsDeviceStats } from '~/features/rtls/types';
import {
  getRtlsDeviceListStatus,
  isSleepableRtlsDevice,
  isTagOrUnknownRtlsDevice,
} from '~/features/rtls/utils';
import CellSettingsIcon from '~/features/rtls/CellSettingsIcon';
import Bolt from '~/icons/Bolt';

import {
  AnchorRangingFigures,
  AnchorSlotBadge,
  AnchorStateChip,
  AnchorStatusCluster,
  describeAnchorDetailLines,
} from './AnchorRowParts';
import {
  ActionButton,
  DetailLines,
  LastSeen,
  ShowMoreButton,
} from './row-parts';
import {
  describeDeviceWithPairedUav,
  describeTagDetailLines,
  TAG_LEAD_WIDTH,
  TagSolveFigures,
  TagStatusCluster,
} from './TagRowParts';

/**
 * The status light of a merged row: liveness and the sleep latch first
 * (`getRtlsDeviceListStatus` keeps the "unknown sleep state never renders
 * green" invariant), then — for a device that would render plain green — the
 * role-aware telemetry health refines the verdict.
 */
export const getRowStatus = (
  device: RtlsDevice,
  stats: RtlsDeviceStats | undefined,
  initiatorEvidence?: InitiatorEvidence
): Status => {
  const role = classifyRole(device.role);
  if (isAnchorRole(role)) {
    // an anchor's liveness, sleep and power state, and for an initiator
    // whether its responders hear it, are all in its health
    return getStatusForHealth(
      getDeviceHealthForRole(
        role,
        stats,
        {
          online: device.online,
          age: device.age,
          sleeping: device.sleeping,
        },
        initiatorEvidence
      )
    );
  }
  if (!device.online) {
    // a lost tag warns (grey when it was last seen asleep) instead of
    // staying red until forgotten
    return getStatusForHealth(
      getDeviceHealthForRole(role, stats, {
        online: false,
        sleeping: device.sleeping,
      })
    );
  }
  const base = getRtlsDeviceListStatus(device);
  if (base !== 'success') {
    return base as Status;
  }
  return getStatusForHealth(
    getDeviceHealthForRole(classifyRole(device.role), stats, {
      online: device.online,
      age: device.age,
    })
  );
};

/** The caption line: system id, sleep state, firmware and parameter count. */
const describeDevice = (device: RtlsDevice): string => {
  const parts = [`system id ${device.id}`];
  if (device.sleeping) {
    parts.push('sleeping');
  } else if (
    device.sleeping === undefined &&
    isTagOrUnknownRtlsDevice(device)
  ) {
    // Distinguishes the grey "unknown" light from the grey "asleep" light.
    parts.push('sleep state unknown');
  }
  if (device.firmwareVersion) {
    parts.push(`fw ${device.firmwareVersion}`);
  }
  if (typeof device.paramCount === 'number') {
    parts.push(`${device.paramCount} params`);
  }
  return parts.join(' · ');
};

/**
 * Width of an anchor row's status light, name, slot badge and state chip, px:
 * its ranging figures then line up across rows, like a tag's solve figures.
 */
const ANCHOR_LEAD_WIDTH = 300;

export type DeviceRowHandlers = {
  /** Asks the server to forget an offline device. */
  onForget?: (id: string) => void;
  onShowOta: (id: string) => void;
  onShowParameters: (id: string) => void;
  onSleep: (id: string) => void;
  onWake: (id: string) => void;
};

/**
 * The per-row action cluster: forget (offline), sleep / wake (known tags and
 * anchors), parameters and firmware update. `locked` (the anchor lock
 * freezes this device) disables every changing action; parameters stay
 * viewable.
 */
const RowActions = ({
  busy,
  device,
  handlers,
  locked,
}: {
  busy: boolean;
  device: RtlsDevice;
  handlers: DeviceRowHandlers;
  locked: boolean;
}) => {
  const { t } = useTranslation();
  const anchor = isAnchorRole(classifyRole(device.role));
  return (
    <Box sx={{ whiteSpace: 'nowrap', display: 'inline-flex' }}>
      {/* Two fixed-intent buttons, like the sleep-all/wake-all pair above the
       * list — deliberately NOT a toggle of the current `sleeping` flag, which
       * may have changed between paint and click and would then invert the
       * user's intent. */}
      {!device.online && handlers.onForget && (
        <ActionButton
          icon={<DeleteOutline fontSize='small' />}
          lockedOut={locked}
          testId='rtls-device-forget'
          tooltip={t('rtlsDevice.action.forget')}
          onClick={() => handlers.onForget?.(device.id)}
        />
      )}
      {/* a lost anchor cannot be commanded; a tag keeps its buttons, since
       * waking a drone that dropped off the list must stay possible */}
      {isSleepableRtlsDevice(device) &&
        !(anchor && !device.online) &&
        (busy ? (
          <IconButton size='small' disabled>
            <CircularProgress size={18} color='inherit' />
          </IconButton>
        ) : (
          <>
            <ActionButton
              icon={<Moon fontSize='small' />}
              lockedOut={locked}
              testId='rtls-device-sleep'
              tooltip={t('rtlsDevice.action.sleep')}
              onClick={() => handlers.onSleep(device.id)}
            />
            <ActionButton
              icon={<Bolt fontSize='small' />}
              lockedOut={locked}
              testId='rtls-device-wake'
              tooltip={t('rtlsDevice.action.wake')}
              onClick={() => handlers.onWake(device.id)}
            />
          </>
        ))}
      {/* the parameters stay viewable while locked; the dialog is read-only */}
      <ActionButton
        icon={<Tune fontSize='small' />}
        testId='rtls-device-parameters'
        tooltip='Parameters'
        onClick={() => handlers.onShowParameters(device.id)}
      />
      <ActionButton
        icon={<SystemUpdate fontSize='small' />}
        lockedOut={locked}
        testId='rtls-device-firmware'
        tooltip='Firmware update'
        onClick={() => handlers.onShowOta(device.id)}
      />
    </Box>
  );
};

export type DeviceStatsRowProps = {
  /** Names the anchors of a tag's own table (tag rows only). */
  nameTableAnchor?: TableAnchorNamer;
  /** What a tag's position is judged by (tag rows only). */
  tagCell?: RtlsTagCell;
  /** An anchor's slot in its cell (0 = initiator), when known. */
  anchorSlot?: number;
  /** Whether a sleep/wake transaction is in flight for this device. */
  busy?: boolean;
  device: RtlsDevice;
  /**
   * Whether the row shows all its telemetry rather than only its header
   * line. A row always shows everything without `onToggleExpanded`.
   */
  expanded?: boolean;
  /**
   * Label of the survey pill: the survey a tag follows or an anchor is on.
   * The pill is hidden if unset.
   */
  surveyLabel?: string;
  /** Status coloring the survey pill. */
  surveyStatus?: Status;
  /** What the survey pill means, when it needs saying. */
  surveyTooltip?: string;
  /** Stable action handlers; the actions are hidden when omitted. */
  handlers?: DeviceRowHandlers;
  /** Whether the device's firmware lock is on: its changing actions are disabled. */
  locked?: boolean;
  /** UWB MACs of the cell initiators, to find a responder's A0 distance. */
  initiatorMacs?: ReadonlySet<number>;
  /**
   * Whether the responders hear the initiator (initiator rows only): its
   * chip reads "Ranging", and its light stays green, only while one does.
   */
  initiatorEvidence?: InitiatorEvidence;
  /** Stable "show more" / "show less" toggle of a row, by device id. */
  onToggleExpanded?: (id: string) => void;
  /** Solve rate the tag is configured for, in Hz, once it is known. */
  solveRateTargetHz?: number;
  stats: RtlsDeviceStats | undefined;
  /** Status of the paired UAV, used to color the drone pill. */
  uavStatus?: Status;
};

const NO_MACS: ReadonlySet<number> = new Set();

/** The header line's role-specific figures, middle and right. */
const RoleContent = ({
  device,
  initiatorMacs,
  locked = false,
  nameTableAnchor,
  role,
  solveRateTargetHz,
  stats,
  where,
}: {
  device: RtlsDevice;
  initiatorMacs: ReadonlySet<number>;
  locked?: boolean;
  nameTableAnchor?: TableAnchorNamer;
  role: RtlsRole;
  solveRateTargetHz?: number;
  stats: RtlsDeviceStats | undefined;
  where: 'figures' | 'cluster';
}) => {
  if (where === 'cluster') {
    return (
      <>
        <CellSettingsIcon device={device} />
        {isAnchorRole(role) ? (
          <AnchorStatusCluster locked={locked} stats={stats} />
        ) : (
          <TagStatusCluster nameTableAnchor={nameTableAnchor} stats={stats} />
        )}
      </>
    );
  }
  return isAnchorRole(role) ? (
    <AnchorRangingFigures
      device={device}
      initiatorMacs={initiatorMacs}
      role={role}
      stats={stats}
    />
  ) : (
    <TagSolveFigures solveRateTargetHz={solveRateTargetHz} stats={stats} />
  );
};

/**
 * One merged device row: header line (light, name, drone pill or an
 * anchor's slot and state, the role's figures, survey pill, the role's
 * status cluster, actions), then — behind "show more" — the rest of the
 * telemetry and the caption. A lost device stays listed, greyed, with when
 * it was last heard.
 */
const DeviceStatsRow = ({
  nameTableAnchor,
  tagCell,
  anchorSlot,
  busy = false,
  device,
  expanded = false,
  surveyLabel,
  surveyStatus,
  surveyTooltip,
  handlers,
  initiatorEvidence,
  initiatorMacs = NO_MACS,
  locked = false,
  onToggleExpanded,
  solveRateTargetHz,
  stats,
  uavStatus,
}: DeviceStatsRowProps) => {
  const { t } = useTranslation();
  const role = classifyRole(device.role);
  const anchor = isAnchorRole(role);
  const lost = isDeviceLost(device);
  const leadWidth = anchor ? ANCHOR_LEAD_WIDTH : TAG_LEAD_WIDTH;

  return (
    <Box
      data-testid={`rtls-device-${device.id}`}
      sx={{ px: 1, py: 1, opacity: lost ? 0.55 : 1 }}
    >
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 1,
          rowGap: 0.5,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minWidth: leadWidth,
          }}
        >
          <StatusLight
            status={
              busy && anchor
                ? Status.WAITING
                : getRowStatus(device, stats, initiatorEvidence)
            }
          />
          <Typography variant='subtitle2' component='div'>
            {describeDeviceWithPairedUav(device, uavStatus)}
          </Typography>
          {anchor ? (
            <>
              <AnchorSlotBadge role={role} slot={anchorSlot} />
              <AnchorStateChip
                busy={busy}
                device={device}
                initiatorEvidence={initiatorEvidence}
                stats={stats}
              />
            </>
          ) : (
            lost && <LastSeen device={device} />
          )}
        </Box>
        <RoleContent
          device={device}
          initiatorMacs={initiatorMacs}
          role={role}
          solveRateTargetHz={solveRateTargetHz}
          stats={stats}
          where='figures'
        />
        {/* the name and the figures keep left, the rest keeps right and
         * moves below them where the panel is too narrow for one line */}
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            columnGap: 1,
            rowGap: 0.5,
            ml: 'auto',
          }}
        >
          {surveyLabel && (
            <Tooltip content={surveyTooltip ?? ''} disabled={!surveyTooltip}>
              {/* Tippy needs a child that forwards refs, which StatusPill does not. */}
              <Box component='span' data-testid='rtls-row-survey'>
                <StatusPill inline status={surveyStatus ?? Status.OFF}>
                  {surveyLabel}
                </StatusPill>
              </Box>
            </Tooltip>
          )}
          <RoleContent
            device={device}
            initiatorMacs={initiatorMacs}
            locked={locked}
            nameTableAnchor={nameTableAnchor}
            role={role}
            stats={stats}
            where='cluster'
          />
          {handlers && (
            <RowActions
              busy={busy}
              device={device}
              handlers={handlers}
              locked={locked}
            />
          )}
        </Box>
      </Box>
      {onToggleExpanded && (
        <ShowMoreButton
          expanded={expanded}
          onClick={() => onToggleExpanded(device.id)}
        />
      )}
      <Collapse unmountOnExit in={expanded || !onToggleExpanded}>
        <DetailLines
          leadWidth={leadWidth}
          lines={
            anchor
              ? describeAnchorDetailLines(t, stats, device.twr)
              : describeTagDetailLines(t, stats, nameTableAnchor, tagCell)
          }
        />
        <Typography
          variant='caption'
          color='textSecondary'
          component='div'
          sx={{ pl: 1, opacity: 0.6 }}
        >
          {describeDevice(device)}
        </Typography>
      </Collapse>
    </Box>
  );
};

/**
 * Memoized: telemetry notifications arrive at a steady cadence and replace
 * the stats-map / UAV-status-map identities on every message — per-row
 * primitive props keep the untouched rows from re-rendering with them.
 */
export default React.memo(DeviceStatsRow);
