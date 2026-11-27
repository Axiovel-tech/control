/**
 * @file Baseline values for the configuration options of the application.
 */

import { type Config } from 'config';

import { LayerType } from '~/model/layers';
import { type Latitude, type Longitude } from '~/utils/geography';

const axiovelIcon =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj4KICA8cmVjdCB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcng9Ijk2IiBmaWxsPSIjMjQ0QzVBIi8+CiAgPGcgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDQuNSw0Ny41KSBzY2FsZSgxLjk4NikiPgogICAgPHBvbHlnb24gcG9pbnRzPSIzMSwzMyA4MCw5OSAxMDYsMTU1IDEzMiwxMDAgMTgxLDM0IDE2OSw4NyAxMzQsMTE3IDEwNywxNzcgNzksMTE3IDQzLDg2IiBmaWxsPSIjRkZGRkZGIi8+CiAgICAKICA8L2c+Cjwvc3ZnPgo=';

const baseline: Config = {
  branding: {
    splashIcon: {
      srcSet: {
        default: axiovelIcon,
        twoX: axiovelIcon,
      },
      width: 96,
      height: 96,
    },
    splashTitle: 'axio control',
  },

  ephemeral: false,

  features: {
    safetySettings: false,
  },

  headerComponents: [
    ['uav-status-summary'],
    ['groups-button'],
    ['battery-status-header-button', 'velocity-summary-header-button'],
    ['rtls-status-header-button'],
    ['connection-status-button'],
    ['server-connection-settings-button', 'safety-button'],
    [
      'broadcast-button',
      'toolbox-button',
      'app-settings-button',
      'alert-button',
    ],
  ],

  language: {
    default: 'en',
    enabled: new Set(['de', 'en', 'fr', 'hu', 'it', 'ja', 'pl', 'zh-Hans']),
    fallback: 'en',
  },

  map: {
    // The geofence is generated from the show; nothing else is drawn by hand
    drawingTools: [['select', 'zoom'], ['edit-feature']],

    features: {
      onCreate() {
        /* do nothing */
      },
    },

    layers: [
      { id: 'venueGrid', type: LayerType.VENUE_GRID, label: 'Venue grid' },
      { id: 'features', type: LayerType.FEATURES, label: 'Features' },
      { id: 'beacons', type: LayerType.BEACONS, label: 'Anchors' },
      { id: 'home', type: LayerType.MISSION_INFO, label: 'Show info' },
      { id: 'uavs', type: LayerType.UAVS, label: 'UAVs' },
    ],

    // Until "Adapt to venue" places the show, the map opens on the Axiovel
    // workshop: the venue grid needs an origin to be drawn around.
    origin: {
      position: [2.166849 as Longitude, 41.5033026 as Latitude],
      angle: '0',
    },

    view: {
      position: [2.166849 as Longitude, 41.5033026 as Latitude],
      angle: '0',
      zoom: 21,
    },
  },

  optimizeForSingleUAV: {
    default: false,
    force: false,
  },

  optimizeUIForTouch: {
    default: null,
    force: false,
  },

  perspectives: ['default'],

  ribbon: {
    label: null,
    position: 'bottomRight',
  },

  server: {
    connectAutomatically: true,
    preventAutodetection: false,
    preventManualSetup: false,
    hostName: 'localhost',
    port: null,
    isSecure: null,
    warnClockSkew: true,
  },

  toastPlacement: 'top-center',

  urls: {
    help: 'https://github.com/Axiovel-tech/control',
  },
};

export default baseline;
