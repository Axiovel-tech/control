import { type Draft } from '@reduxjs/toolkit';

import { type Collection } from '~/utils/collections';

import { classifyRole, isAnchorRole } from './stats-utils';
import { type RtlsDevice } from './types';

/** Whether a device is a tag, or a device whose role is not known yet. */
export const isTagOrUnknownRtlsDevice = (device: RtlsDevice): boolean =>
  !device.role || device.role === 'tag';

/**
 * Whether a device offers sleep/wake: tags (or devices whose role is not
 * known yet) and anchors. A disabled device does not range, so there is
 * nothing to sleep.
 */
export const isSleepableRtlsDevice = (device: RtlsDevice): boolean =>
  isTagOrUnknownRtlsDevice(device) || isAnchorRole(classifyRole(device.role));

/**
 * Updates the state of an RTLS device with the given ID in a device collection,
 * creating the device if it does not exist yet.
 *
 * @param devices - The device collection to modify
 * @param id - The identifier (system id as a string) of the device to update
 * @param properties - The new properties of the device
 */
export function updateStateOfRtlsDevice(
  devices: Draft<Collection<RtlsDevice>>,
  id: RtlsDevice['id'],
  properties: Omit<RtlsDevice, 'id'>
): void {
  const device = devices.byId[id];

  if (device) {
    Object.assign(device, properties);
  } else {
    devices.byId[id] = Object.assign(
      {
        id,
        online: false,
      },
      properties
    );
    devices.order.push(id);
  }
}

/**
 * Returns the status light value to show for a device in the RTLS device
 * list.
 *
 * `sleeping === undefined` on a drone (tag) renders as unknown (grey), never
 * as awake/green: the server-side sleep latch may be stale or missing, and
 * rendering such a device green inverted user intent on a live show
 * (2026-07-21). An anchor renders grey only while its heartbeat reports it
 * asleep; its power state refines this on the row (`getRowStatus`).
 */
export function getRtlsDeviceListStatus(
  device: RtlsDevice
): 'error' | 'off' | 'success' {
  if (!device.online) {
    return 'error';
  }

  if (device.role && device.role !== 'tag') {
    // Anchors (and disabled devices) report no tri-state sleep latch: an
    // unknown value is not a reason to grey them out.
    return device.sleeping === true ? 'off' : 'success';
  }

  // Grey for both "asleep" and "sleep state unknown"; the secondary text of
  // the row distinguishes the two. Only an explicit `sleeping: false` may
  // render green.
  return device.sleeping === false ? 'success' : 'off';
}
