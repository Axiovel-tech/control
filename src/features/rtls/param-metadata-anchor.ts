/**
 * @file Static metadata of the anchor power, battery and motion-watch
 * parameters (and SLEEP, which tags share), mirrored from rtls-link-zephyr
 * (lib/power, lib/battery, lib/management/src/motion). Spread into the
 * catalogue of `param-metadata.ts`.
 */

import { type RtlsParamMetadata } from './param-metadata';

export const ANCHOR_PARAM_METADATA: Record<string, RtlsParamMetadata> = {
  /* --- Anchor lock (rtls-link-zephyr anchor-power-path.md, "Lock") --- */
  LOCK: {
    description: "Anchor lock: use the panel's Lock/Unlock",
    enumLabels: { 0: 'unlocked', 1: 'locked' },
    min: 0,
    max: 1,
    defaultValue: 0,
  },

  /* --- Power and sleep (lib/power/src/{power_params,path/sleep_param}.cpp) --- */
  SLEEP: {
    description:
      'Sleep request/state. Tags: 1 sleeps (power rails down, management ' +
      'link up), 0 wakes. Anchors: 0 awake, 1 asleep (UWB off, network up, ' +
      'runs on its pack if unplugged, wakes remotely), 2 off (button start ' +
      'only), 3 plain standby (external power, not ranging; unplugging ' +
      'powers it off). Only 0 and 1 are written from here; the anchor ' +
      "state shown on its row comes from the anchor's power state",
    enumLabels: {
      0: 'awake',
      1: 'asleep',
      2: 'off (anchors)',
      3: 'standby (anchors)',
    },
    min: 0,
    max: 3,
    defaultValue: 0,
  },

  /* --- Anchor battery (lib/battery, lib/power/src/path/charging.cpp) --- */
  BAT_PROFILE: {
    description:
      'Battery cell fitted to the anchor; the gauge and the charger follow ' +
      'its profile. Read at boot. 0 selects none and keeps charging inhibited',
    enumLabels: { 0: 'none', 1: 'lip1708', 2: 'fey7ah' },
    min: 0,
    max: 2,
    defaultValue: 0,
  },
  BAT_NTC: {
    description:
      "1 when the board has the TS bias network and the pack's thermistor " +
      'on J102: the charger follows the pack temperature. With 1 and no ' +
      'thermistor the charger reads cold and does not charge',
    enumLabels: { 0: 'no pack thermistor', 1: 'pack thermistor fitted' },
    min: 0,
    max: 1,
    defaultValue: 0,
  },

  /* --- Anchor motion watch (lib/management/src/motion/motion_params.cpp) --- */
  MOT_TILT_DEG: {
    description:
      'Tilt from the orientation captured at the start that, held for 3 s, ' +
      'marks the anchor as moved (latched until the next start). Live',
    unit: 'deg',
    min: 0.2,
    max: 10,
    defaultValue: 0.5,
  },
  MOT_KNOCK_MG: {
    description:
      'Accelerometer slope threshold of a knock, which marks the anchor as ' +
      "moved; 0 ignores knocks. Rounded to the chip's 15.625 mg steps. Live",
    unit: 'mg',
    min: 0,
    max: 984,
    defaultValue: 250,
  },
};
