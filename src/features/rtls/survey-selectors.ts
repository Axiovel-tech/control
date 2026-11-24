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
import {
  type RtlsSurveySliceState,
  surveyRefusalKey,
  warningsSignature,
} from './survey';
import {
  EMPTY_SKETCH,
  inSlotOrder,
  type RtlsSurveyAnchor,
  type RtlsSurveySketch,
  surveyCells,
} from './survey-sketch';

export const getRtlsSurveyState: AppSelector<RtlsSurveySliceState> = (state) =>
  state.rtlsSurvey;

/**
 * Selector that returns every online anchor in slot order, with what the
 * survey page shows of it: its slot and cell and the position it stores,
 * from the site anchor list, and its live range to A0.
 */
export const getRtlsSurveyAnchors: AppSelector<RtlsSurveyAnchor[]> =
  createSelector(
    getRtlsAnchorDevices,
    getRtlsAnchors,
    (devices, siteAnchors) => {
      const initiatorMacs = getInitiatorMacs(siteAnchors);
      return inSlotOrder(
        devices
          .filter((device) => device.online)
          .map((device) => {
            const site = siteAnchors.find(
              (anchor) => String(anchor.systemId) === device.id
            );
            return {
              id: device.id,
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

/** Selector that returns whether the warnings now shown are acknowledged. */
export const areRtlsSurveyWarningsAcknowledged: AppSelector<boolean> = (
  state
) =>
  state.rtlsSurvey.acknowledged !== undefined &&
  state.rtlsSurvey.acknowledged === warningsSignature(state.rtlsSurvey.survey);

/** Selector that returns the online anchors per cell, by sketch key. */
export const getRtlsSurveyCells: AppSelector<
  Record<string, RtlsSurveyAnchor[]>
> = createSelector(getRtlsSurveyAnchors, surveyCells);

/** Selector that returns the operator's sketch of a cell. */
export const getRtlsSurveySketch: AppSelector<RtlsSurveySketch, [string]> = (
  state,
  cell
) => state.rtlsSurvey.sketches[cell] ?? EMPTY_SKETCH;

/**
 * Selector that returns the anchors a refit names: the group of the held
 * survey, as far as its anchors are still online.
 */
export const getRtlsSurveyRefitGroup: AppSelector<RtlsSurveyAnchor[]> =
  createSelector(
    getRtlsSurveyAnchors,
    (state: RootState) => state.rtlsSurvey.survey?.anchors,
    (anchors, group) => anchors.filter(({ id }) => group?.includes(id) ?? false)
  );
