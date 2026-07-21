import { type Draft } from '@reduxjs/toolkit';

import { type Collection } from '~/utils/collections';

import { type RtlsDevice } from './types';

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
 * (2026-07-21). Anchors have no sleep state, so they stay green while online.
 */
export function getRtlsDeviceListStatus(
  device: RtlsDevice
): 'error' | 'off' | 'success' {
  if (!device.online) {
    return 'error';
  }

  if (device.role && device.role !== 'tag') {
    // Not sleepable; there is no sleep state to be unknown about.
    return 'success';
  }

  // Grey for both "asleep" and "sleep state unknown"; the secondary text of
  // the row distinguishes the two. Only an explicit `sleeping: false` may
  // render green.
  return device.sleeping === false ? 'success' : 'off';
}
