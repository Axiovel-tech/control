/**
 * @file The tag-specific parts of an RTLS device row: the paired-drone pill
 * on the name, the solve figures and anchor bars of the header line, and the
 * detail lines behind "show more".
 */

import Box from '@mui/material/Box';
import type React from 'react';
import { useTranslation } from 'react-i18next';

import { StatusLight, StatusPill, Tooltip } from '@skybrush/mui-components';

import BatteryIndicator from '~/components/BatteryIndicator';
import { Status } from '~/components/semantics';
import AnchorBars from '~/features/rtls/AnchorBars';
import { describeFleetHealth } from '~/features/rtls/fleet-health';
import { type I18nText } from '~/features/rtls/i18n-text';
import { getRtlsDeviceDisplayName } from '~/features/rtls/selectors';
import { countAnchorsInMask } from '~/features/rtls/stats-utils';
import {
  describeTagSurvey,
  type TableAnchorNamer,
  tableAnchorNamer,
  tableRowNames,
} from '~/features/rtls/survey-health';
import {
  type RtlsDevice,
  type RtlsDeviceStats,
  type RtlsFlightController,
} from '~/features/rtls/types';

import { type DetailLine, HeaderStat } from './row-parts';

const formatNumber = (
  value: number | undefined,
  unit: string,
  digits = 1
): string => (value === undefined ? '—' : `${value.toFixed(digits)} ${unit}`);

type DronePillText = {
  status: Status;
  label: I18nText;
  tooltip: I18nText;
  /** Server explanation of an ambiguous claim, shown instead of `tooltip`. */
  reason?: string;
};

/**
 * Pill of the drone a tag belongs to, named by the flight-controller system id
 * the tag reports also while asleep: in the drone's UAV-list status color
 * while the tag hears its flight controller, grey while the tag only
 * remembers it (asleep or powered off), a warning for an unusable claim.
 */
export const describeDronePill = (
  flightController: RtlsFlightController,
  uavStatus: Status | undefined
): DronePillText => {
  if (flightController.state === 'ambiguous') {
    const { reason, systemId } = flightController;
    return {
      status: Status.WARNING,
      label:
        systemId === undefined
          ? { key: 'rtlsFlightController.pill.ambiguousNoId' }
          : {
              key: 'rtlsFlightController.pill.ambiguous',
              values: { id: systemId },
            },
      tooltip: { key: 'rtlsFlightController.tooltip.ambiguous' },
      reason,
    };
  }

  const values = { id: flightController.systemId };
  const live = flightController.state === 'live';
  return {
    status: live ? (uavStatus ?? Status.INFO) : Status.OFF,
    label: { key: 'rtlsFlightController.pill.known', values },
    tooltip: {
      key: live
        ? 'rtlsFlightController.tooltip.live'
        : 'rtlsFlightController.tooltip.remembered',
      values,
    },
  };
};

const DronePill = ({
  flightController,
  uavStatus,
}: {
  flightController: RtlsFlightController;
  uavStatus: Status | undefined;
}) => {
  const { t } = useTranslation();
  const { label, reason, status, tooltip } = describeDronePill(
    flightController,
    uavStatus
  );
  return (
    <Tooltip content={reason ?? t(tooltip.key, tooltip.values)}>
      {/* Tippy needs a child that forwards refs, which StatusPill does not. */}
      <Box component='span'>
        <StatusPill inline status={status}>
          {t(label.key, label.values)}
        </StatusPill>
      </Box>
    </Tooltip>
  );
};

/**
 * Builds the primary line for a device row: the device name and, for a tag
 * that reports its flight controller, the drone it belongs to as a pill.
 */
export const describeDeviceWithPairedUav = (
  device: RtlsDevice,
  uavStatus: Status | undefined
): React.ReactNode =>
  device.flightController === undefined ? (
    getRtlsDeviceDisplayName(device)
  ) : (
    <Box
      component='span'
      sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
    >
      {getRtlsDeviceDisplayName(device)}
      <DronePill
        flightController={device.flightController}
        uavStatus={uavStatus}
      />
    </Box>
  );

/**
 * Width of a tag row's status light, name and drone pill, px: its solve
 * figures then start at the same place on every row, and the values of its
 * detail lines start right below them.
 */
export const TAG_LEAD_WIDTH = 220;

const anchorsSeenOf = (stats: RtlsDeviceStats | undefined): number =>
  stats?.anchorsSeen ?? countAnchorsInMask(stats?.anchorMask);

/** A tag's solve rate and percentage, on its header line. */
export const TagSolveFigures = ({
  stats,
}: {
  stats: RtlsDeviceStats | undefined;
}) => (
  <>
    <HeaderStat
      label='Solve rate'
      value={formatNumber(stats?.solveRateHz, 'Hz')}
    />
    <HeaderStat
      label='Solve %'
      value={
        stats?.solvePct === undefined ? '—' : `${stats.solvePct.toFixed(0)}%`
      }
    />
  </>
);

/** A tag's battery and anchor bars, at the right of its header line. */
export const TagStatusCluster = ({
  nameTableAnchor,
  stats,
}: {
  nameTableAnchor?: TableAnchorNamer;
  stats: RtlsDeviceStats | undefined;
}) => (
  <>
    {stats?.batteryVoltage !== undefined && (
      <Box sx={{ width: 56 }}>
        <BatteryIndicator voltage={stats.batteryVoltage} />
      </Box>
    )}
    <AnchorBars
      anchorMask={stats?.anchorMask}
      anchorsSeen={anchorsSeenOf(stats)}
      names={
        nameTableAnchor && tableRowNames(stats?.anchorTable, nameTableAnchor)
      }
    />
  </>
);

type T = ReturnType<typeof useTranslation>['t'];

/** The names for a row rendered without the site list: system id or MAC. */
const NAME_WITHOUT_SITE = tableAnchorNamer([]);

/**
 * The "Survey" line of a tag: the survey it follows and the anchors it
 * uses, the anchors it leaves out by name with why, and the drift.
 */
const describeSurveyLine = (
  t: T,
  stats: RtlsDeviceStats | undefined,
  nameOf: TableAnchorNamer,
  planarSurvey: boolean
): DetailLine[] => {
  const survey = describeTagSurvey(stats, nameOf, planarSurvey);
  if (survey === undefined) {
    return [];
  }
  const { drift, excluded, following, unnamed } = survey;
  const parts = [
    t(following.key, following.values),
    ...(excluded.length > 0
      ? [
          t('rtlsSurveyHealth.line.excluded', {
            anchors: excluded
              .map(({ anchor, why }) =>
                t('rtlsSurveyHealth.line.excludedAnchor', {
                  anchor,
                  why: t(why.key),
                })
              )
              .join(', '),
          }),
        ]
      : []),
    ...(unnamed ? [t(unnamed.key, unnamed.values)] : []),
    ...(drift ? [t(drift.key, drift.values)] : []),
  ];
  return [
    {
      key: 'survey',
      name: t('rtlsSurveyHealth.line.name'),
      value: parts.join(' · '),
    },
  ];
};

/** The tag rows' detail lines, behind "show more". */
export const describeTagDetailLines = (
  t: T,
  stats: RtlsDeviceStats | undefined,
  nameTableAnchor: TableAnchorNamer = NAME_WITHOUT_SITE,
  planarSurvey = false
): DetailLine[] => {
  const anchorsSeen = anchorsSeenOf(stats);
  const rowNames = tableRowNames(stats?.anchorTable, nameTableAnchor);
  return [
    {
      key: 'fixAge',
      name: 'Fix age',
      value: formatNumber(stats?.fixAgeMs, 'ms', 0),
    },
    {
      key: 'clockDrift',
      name: 'Clock drift',
      value: formatNumber(stats?.clockPpm, 'ppm', 2),
    },
    {
      key: 'anchorsSeen',
      name: 'Anchors seen',
      value: String(anchorsSeen),
    },
    ...describeSurveyLine(t, stats, nameTableAnchor, planarSurvey),
    ...describeFleetHealth(stats, rowNames, planarSurvey).map(
      ({ id, status, text }) => ({
        key: id,
        // gray values throughout; a metric out of its green zone gets a dot in
        // the zone's color beside its name
        name: (
          <>
            {t(`rtlsFleetHealth.label.${id}`)}
            {(status === Status.WARNING || status === Status.ERROR) && (
              <StatusLight inline size='small' status={status} />
            )}
          </>
        ),
        value: t(text.key, text.values),
      })
    ),
  ];
};
