import type { GdmShowInfo } from './types';

/** Payload of one UAV's `.gdm` upload job, sent as `OBJ-CMD __gdm_upload`. */
export type GdmUploadJobData = {
  format: 'gdm';
  gdmb: string;
  showHash: string;
  config: Record<string, unknown>;
};

export const isGdmUploadJobData = (data: unknown): data is GdmUploadJobData =>
  typeof data === 'object' &&
  data !== null &&
  (data as GdmUploadJobData).format === 'gdm';

/**
 * Builds the `.gdm` upload payload of a UAV assigned to the given slot: the
 * slot's certified `.gdmb`, the show hash, and the show-level settings
 * (`config`) that `.skyc` uploads carry as well.
 *
 * Refuses a slot whose `.gdmb` is not covered by a passing certification
 * (spec §3.7: the ground path must not upload it).
 */
export function createGdmUploadForSlot(
  gdm: GdmShowInfo | undefined,
  uavId: string,
  missionIndex: number,
  config: Record<string, unknown>
): GdmUploadJobData {
  if (!gdm) {
    throw new Error('No .gdm show is loaded');
  }

  const drone = gdm.drones[missionIndex];
  if (!drone) {
    throw new Error(`No .gdm drone for UAV ${uavId} (index ${missionIndex})`);
  }

  if (gdm.certification.status !== 'pass' || !drone.certified) {
    throw new Error(
      `Drone ${drone.id} of the .gdm show is not certified; refusing to upload it to UAV ${uavId}`
    );
  }

  return {
    format: 'gdm',
    gdmb: drone.gdmb,
    showHash: gdm.showHash,
    config,
  };
}
