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
} from './selectors';
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
 * Selector that returns every anchor the server lists, online or not, in
 * slot order, with what the survey page shows of it: its slot and cell and
 * the position it stores, from the site anchor list, and its live range to
 * A0.
 */
const getKnownAnchors: AppSelector<
  Array<RtlsSurveyAnchor & { online: boolean }>
> = createSelector(
  getRtlsAnchorDevices,
  getRtlsAnchors,
  (devices, siteAnchors) => {
    const initiatorMacs = getInitiatorMacs(siteAnchors);
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
          initiatorDistanceM: findInitiatorPeer(device.twr, initiatorMacs)
            ?.distanceM,
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
