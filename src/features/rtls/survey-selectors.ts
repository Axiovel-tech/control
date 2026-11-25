/**
 * @file Selectors of the anchor survey page.
 */

import { createSelector } from '@reduxjs/toolkit';

import { isShowAuthorizedToStartLocally } from '~/features/show/selectors';
import { type AppSelector, type RootState } from '~/store/reducers';

import {
  findInitiatorPeer,
  getAnchorSlot,
  getInitiatorMacs,
} from './anchor-utils';
import { hasPlottableAnchor } from './pos-view-utils';
import {
  getPossiblyArmedUavIds,
  getRtlsAnchorDevices,
  getRtlsAnchorLock,
  getRtlsAnchors,
  getRtlsDeviceDisplayName,
  getRtlsStatsById,
} from './selectors';
import { isAnchorResting } from './stats-utils';
import { type RtlsSurveySliceState, surveyRefusalKey } from './survey';
import { type RtlsSurveyPage, surveyPage } from './survey-page';
import {
  inSlotOrder,
  type RtlsSurveyAnchor,
  surveyCells,
} from './survey-sketch';

export const getRtlsSurveyState: AppSelector<RtlsSurveySliceState> = (state) =>
  state.rtlsSurvey;

/**
 * Selector that returns the ids of the anchors that range on their stored
 * session now (online and neither asleep nor in standby), as one string: the
 * stats it is read from arrive every second, and the page must not be worked
 * out again unless the answer changes.
 */
const getOperatingAnchorKey: AppSelector<string> = createSelector(
  getRtlsAnchorDevices,
  getRtlsStatsById,
  (devices, statsById) =>
    devices
      .filter(
        (device) =>
          device.online &&
          !isAnchorResting(statsById[device.id], device.sleeping)
      )
      .map(({ id }) => id)
      .join(',')
);

/**
 * Selector that returns every anchor the server lists, online or not, in
 * slot order, with what the survey page shows of it: its slot and cell and
 * the position and survey ID it stores, from the site anchor list, its live
 * range to A0, and whether it ranges on its stored session now.
 */
const getKnownAnchors: AppSelector<
  Array<RtlsSurveyAnchor & { online: boolean }>
> = createSelector(
  getRtlsAnchorDevices,
  getRtlsAnchors,
  getOperatingAnchorKey,
  (devices, siteAnchors, operatingKey) => {
    const initiatorMacs = getInitiatorMacs(siteAnchors);
    const operating = new Set(operatingKey.split(','));
    return inSlotOrder(
      devices.map((device) => {
        const site = siteAnchors.find(
          (anchor) => String(anchor.systemId) === device.id
        );
        return {
          id: device.id,
          online: device.online,
          name: getRtlsDeviceDisplayName(device),
          slot: getAnchorSlot(device, siteAnchors),
          cell: site?.cell,
          stored:
            site !== undefined && hasPlottableAnchor(site)
              ? { north: site.ned.north, east: site.ned.east }
              : undefined,
          storedDown: site?.ned?.down,
          surveyId: site?.surveyId,
          initiatorDistanceM: findInitiatorPeer(device.twr, initiatorMacs)
            ?.distanceM,
          // the server lets a sleeping or standby anchor stay out of a
          // survey, never one that ranges
          operating: operating.has(device.id),
        };
      })
    );
  }
);

/** Selector that returns the online anchors, in slot order. */
export const getRtlsSurveyAnchors: AppSelector<RtlsSurveyAnchor[]> =
  createSelector(getKnownAnchors, (anchors) =>
    anchors.filter(({ online }) => online)
  );

/**
 * Selector that returns the i18n key of why neither Survey nor Commit may be
 * sent now (`surveyRefusalKey`), read live from the store.
 */
export const getRtlsSurveyRefusalKey: AppSelector<string | undefined> =
  createSelector(
    getRtlsAnchorLock,
    isShowAuthorizedToStartLocally,
    getPossiblyArmedUavIds,
    getRtlsSurveyAnchors,
    (lock, showAuthorized, armedIds, anchors) =>
      surveyRefusalKey({
        lockedCount: lock?.lockedCount ?? 0,
        showAuthorized,
        armedCount: armedIds.length,
        anyOnline: anchors.length > 0,
      })
  );

/** Selector that returns the online anchors per cell, by sketch key. */
export const getRtlsSurveyCells: AppSelector<
  Record<string, RtlsSurveyAnchor[]>
> = createSelector(getRtlsSurveyAnchors, surveyCells);

/** Selector that returns the survey page of a cell (`surveyPage`). */
export const getRtlsSurveyPage: AppSelector<RtlsSurveyPage, [string]> =
  createSelector(
    [
      getRtlsSurveyState,
      getRtlsSurveyCells,
      getKnownAnchors,
      getRtlsSurveyRefusalKey,
      (_state: RootState, cell: string) => cell,
    ],
    surveyPage
  );
