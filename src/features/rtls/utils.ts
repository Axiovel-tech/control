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
